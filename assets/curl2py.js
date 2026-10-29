/* ═══════════════════════════════════════════════════════════════════════════
 * curl2py.js — Uno o varios cURL (bash/cmd) → script Python (requests.Session).
 * Sin dependencias. Funciona en navegador y Node.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ─── Tokenizador estilo bash ───────────────────────────────────────────── */
  function tokenize(src) {
    // Quitar continuaciones de línea: "\" + salto (bash), "^" + salto (cmd), "`" + salto (PowerShell)
    src = String(src).replace(/\r\n/g, '\n');
    // "Copy as cURL (cmd)" de Chrome en Windows: ^" y ^\n → quitar el escape ^
    if (/\^"/.test(src)) src = src.replace(/\^\n/g, ' ').replace(/\^(.)/g, '$1');
    src = src.replace(/[\\`]\n/g, ' ');
    const out = []; let cur = null; let i = 0; const n = src.length;
    const push = () => { if (cur !== null) out.push(cur); cur = null; };
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n') { push(); i++; continue; }
      if (cur === null) cur = '';
      if (c === "'") {                       // comillas simples: literal
        const j = src.indexOf("'", i + 1);
        if (j < 0) { cur += src.slice(i + 1); i = n; } else { cur += src.slice(i + 1, j); i = j + 1; }
        continue;
      }
      if (c === '$' && src[i + 1] === "'") { // $'...' ANSI-C
        i += 2;
        while (i < n && src[i] !== "'") {
          if (src[i] === '\\' && i + 1 < n) {
            const e = src[i + 1]; i += 2;
            const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v' };
            if (e === 'x') { const h = src.slice(i).match(/^[0-9a-fA-F]{1,2}/); if (h) { cur += String.fromCharCode(parseInt(h[0], 16)); i += h[0].length; } }
            else if (e === 'u' || e === 'U') { const h = src.slice(i).match(e === 'u' ? /^[0-9a-fA-F]{1,4}/ : /^[0-9a-fA-F]{1,8}/); if (h) { cur += String.fromCodePoint(parseInt(h[0], 16)); i += h[0].length; } }
            else cur += (e in map) ? map[e] : '\\' + e;
          } else { cur += src[i++]; }
        }
        i++; continue;
      }
      if (c === '"') {                       // comillas dobles
        i++;
        while (i < n && src[i] !== '"') {
          if (src[i] === '\\' && i + 1 < n && '"\\$`\n'.includes(src[i + 1])) { cur += src[i + 1]; i += 2; }
          else cur += src[i++];
        }
        i++; continue;
      }
      if (c === '\\' && i + 1 < n) { cur += src[i + 1]; i += 2; continue; }
      cur += c; i++;
    }
    push();
    return out;
  }

  /* ─── Parser de flags de curl ───────────────────────────────────────────── */
  const VALUE_FLAGS = new Set(['-X','--request','-H','--header','-d','--data','--data-raw','--data-binary','--data-ascii',
    '--data-urlencode','--json','-F','--form','--form-string','-u','--user','-b','--cookie','-A','--user-agent','-e','--referer',
    '-x','--proxy','-m','--max-time','--connect-timeout','--url','-o','--output','-c','--cookie-jar','-w','--write-out',
    '--retry','--cacert','--cert','--key','-E','-T','--upload-file','--resolve','--limit-rate','-U','--proxy-user','--oauth2-bearer',
    '--max-redirs','-r','--range','--interface','-K','--config','--aws-sigv4','--ciphers','--tls-max']);

  function parseCurl(cmd) {
    let toks = tokenize(String(cmd).trim());
    if (toks[0] && /(^|\/)curl(\.exe)?$/i.test(toks[0])) toks = toks.slice(1);
    const r = { method: null, url: '', headers: [], cookies: [], data: [], dataMode: null, form: [],
      auth: null, insecure: false, follow: false, compressed: false, proxy: '', timeout: null, get: false, head: false, warnings: [] };
    for (let i = 0; i < toks.length; i++) {
      let t = toks[i], v = null;
      // --flag=valor
      if (/^--[a-z0-9-]+=/.test(t)) { const k = t.indexOf('='); v = t.slice(k + 1); t = t.slice(0, k); }
      // -Hvalor / -XPOST pegados
      else if (/^-[A-Za-z]./.test(t) && VALUE_FLAGS.has(t.slice(0, 2))) { v = t.slice(2); t = t.slice(0, 2); }
      const needVal = VALUE_FLAGS.has(t);
      if (needVal && v === null) v = toks[++i] ?? '';
      switch (t) {
        case '-X': case '--request': r.method = v.toUpperCase(); break;
        case '-H': case '--header': {
          const k = v.indexOf(':'); if (k < 0) break;
          const name = v.slice(0, k).trim(), val = v.slice(k + 1).trim();
          if (name.toLowerCase() === 'cookie') r.cookies.push(...parseCookieStr(val));
          else r.headers.push([name, val]);
          break;
        }
        case '-d': case '--data': case '--data-ascii':
          if (v.startsWith('@')) r.warnings.push('Body desde archivo ' + v + ' (se lee con open())');
          r.data.push({ v, raw: false }); r.dataMode = r.dataMode || 'data'; break;
        case '--data-raw': r.data.push({ v, raw: true }); r.dataMode = r.dataMode || 'data'; break;
        case '--data-binary': r.data.push({ v, raw: false, binary: true }); r.dataMode = r.dataMode || 'data'; break;
        case '--data-urlencode': {
          let enc;
          const eq = v.indexOf('=');
          if (eq < 0) enc = encodeURIComponent(v);
          else enc = (eq > 0 ? v.slice(0, eq) + '=' : '') + encodeURIComponent(v.slice(eq + 1));
          r.data.push({ v: enc, raw: true }); r.dataMode = r.dataMode || 'data'; break;
        }
        case '--json':
          r.data.push({ v, raw: true }); r.dataMode = 'json';
          if (!r.headers.some(h => h[0].toLowerCase() === 'content-type')) r.headers.push(['Content-Type', 'application/json']);
          if (!r.headers.some(h => h[0].toLowerCase() === 'accept')) r.headers.push(['Accept', 'application/json']);
          break;
        case '-F': case '--form': case '--form-string': {
          const eq = v.indexOf('='); if (eq < 0) break;
          const key = v.slice(0, eq); let val = v.slice(eq + 1);
          if (t !== '--form-string' && (val.startsWith('@') || val.startsWith('<'))) {
            const parts = val.slice(1).split(';');
            const f = { key, file: parts[0], isFile: val.startsWith('@'), type: null, filename: null };
            parts.slice(1).forEach(p => { const m = p.match(/^\s*(type|filename)=(.*)$/); if (m) f[m[1]] = m[2].replace(/^"|"$/g, ''); });
            r.form.push(f);
          } else {
            if (t !== '--form-string') val = val.replace(/;type=[^;]*$/, '');
            r.form.push({ key, value: val });
          }
          break;
        }
        case '-u': case '--user': { const k = v.indexOf(':'); r.auth = k < 0 ? [v, ''] : [v.slice(0, k), v.slice(k + 1)]; break; }
        case '--oauth2-bearer': r.headers.push(['Authorization', 'Bearer ' + v]); break;
        case '-b': case '--cookie':
          if (v.includes('=')) r.cookies.push(...parseCookieStr(v)); else r.warnings.push('Archivo de cookies ignorado: ' + v);
          break;
        case '-A': case '--user-agent': r.headers.push(['User-Agent', v]); break;
        case '-e': case '--referer': r.headers.push(['Referer', v]); break;
        case '-x': case '--proxy': r.proxy = v; break;
        case '-m': case '--max-time': r.timeout = parseFloat(v) || null; break;
        case '--url': r.url = v; break;
        case '-k': case '--insecure': r.insecure = true; break;
        case '-L': case '--location': r.follow = true; break;
        case '--compressed': r.compressed = true; break;
        case '-G': case '--get': r.get = true; break;
        case '-I': case '--head': r.head = true; break;
        default:
          if (t.startsWith('-')) {
            // flags combinados tipo -sSLk
            if (/^-[a-zA-Z]{2,}$/.test(t)) { if (t.includes('k')) r.insecure = true; if (t.includes('L')) r.follow = true; if (t.includes('G')) r.get = true; if (t.includes('I')) r.head = true; }
          } else if (!r.url) r.url = t;
      }
    }
    if (r.url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(r.url)) r.url = 'http://' + r.url;
    // Cuerpo final
    r.body = r.data.length ? r.data.map(d => d.v).join('&') : null;
    if (r.get && r.body !== null) {
      r.url += (r.url.includes('?') ? '&' : '?') + r.body; r.body = null;
    }
    if (!r.method) r.method = r.head ? 'HEAD' : (r.body !== null || r.form.length) ? 'POST' : 'GET';
    return r;
  }

  function parseCookieStr(s) {
    return String(s).split(';').map(p => p.trim()).filter(Boolean).map(p => {
      const k = p.indexOf('='); return k < 0 ? [p, ''] : [p.slice(0, k).trim(), p.slice(k + 1).trim()];
    });
  }

  function splitUrl(url) {
    const q = url.indexOf('?'); if (q < 0) return { base: url, params: [] };
    let qs = url.slice(q + 1), hash = '';
    const h = qs.indexOf('#'); if (h >= 0) { hash = qs.slice(h); qs = qs.slice(0, h); }
    return { base: url.slice(0, q) + hash, params: parseQs(qs) };
  }
  function dec(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (_) { return s; } }
  function parseQs(qs) {
    if (!qs) return [];
    return qs.split('&').filter(Boolean).map(p => { const k = p.indexOf('='); return k < 0 ? [dec(p), ''] : [dec(p.slice(0, k)), dec(p.slice(k + 1))]; });
  }
  function looksUrlEncoded(s) { return /^[^=&\s{}\[\]<>"]+=[^&\s]*(&[^=&\s]+=[^&\s]*)*$/.test(s); }

  /* ─── Literales Python ─────────────────────────────────────────────────── */
  // Nombres de variables Python a interpolar como f-string ({{SHOP}} → {SHOP})
  let FSTR = null;
  function pyStr(s) {
    s = String(s);
    const only = FSTR && s.match(/^\{\{\s*(\w+)\s*\}\}$/);
    if (only && FSTR.has(only[1])) return only[1];
    if (FSTR && /\{\{\s*\w+\s*\}\}/.test(s)) {
      const parts = s.split(/(\{\{\s*\w+\s*\}\})/);
      if (parts.some(x => { const m = x.match(/^\{\{\s*(\w+)\s*\}\}$/); return m && FSTR.has(m[1]); })) {
        return 'f' + JSON.stringify(parts.map(x => {
          const m = x.match(/^\{\{\s*(\w+)\s*\}\}$/);
          return m && FSTR.has(m[1]) ? '\u0000' + m[1] + '\u0001' : x.replace(/\{/g, '{{').replace(/\}/g, '}}');
        }).join('')).replace(/\\u0000/g, '{').replace(/\\u0001/g, '}');
      }
    }
    return JSON.stringify(s);
  }
  function pyTriple(s) {
    return '"""' + String(s).replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"').replace(/"$/, '\\"') + '"""';
  }

  /* ─── Variables automáticas: dominio de la tienda y token ──────────────── */
  const TOKEN_HDR = /^(x-[\w-]*access-token|x-api-key|authorization)$/i;
  function autoVars(m) {
    const vars = [];
    let host = '';
    try { host = new URL(m.url).host; } catch (_) {}
    const shopLike = /\.myshopify\.com$/i.test(host) || /\/admin\/api\/|\/api\/[\d-]+\/graphql|\/cart(\/[\w-]+)?\.js|\/products\/[^/]+\.js/i.test(m.url)
      || m.headers.some(h => /^x-shopify-/i.test(h[0]));
    if (host && shopLike) {
      vars.push(['SHOP', host]);
      const swap = v => v.split(host).join('{{SHOP}}');
      m.url = swap(m.url);
      m.headers = m.headers.map(([k, v]) => [k, /^(origin|referer)$/i.test(k) ? swap(v) : v]);
    }
    const t = m.headers.find(h => TOKEN_HDR.test(h[0]) && h[1]);
    if (t) {
      const mm = t[1].match(/^(Bearer|Token|Basic)\s+(.+)$/i);
      const val = mm ? mm[2] : t[1];
      vars.push(['TOKEN', val]);
      m.headers = m.headers.map(([k, v]) => [k, TOKEN_HDR.test(k) ? v.split(val).join('{{TOKEN}}') : v]);
    }
    return vars;
  }
  function pyVal(v, ind = 0) {
    const pad = '    '.repeat(ind + 1), end = '    '.repeat(ind);
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'None';
    if (typeof v === 'string') return pyStr(v);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      return '[\n' + v.map(x => pad + pyVal(x, ind + 1) + ',').join('\n') + '\n' + end + ']';
    }
    if (v && v.__tuple) return '(' + v.items.map(x => pyVal(x, ind)).join(', ') + (v.items.length === 1 ? ',' : '') + ')';
    if (v && v.__code) return v.code;
    const ks = Object.keys(v);
    if (!ks.length) return '{}';
    return '{\n' + ks.map(k => pad + pyStr(k) + ': ' + pyVal(v[k], ind + 1) + ',').join('\n') + '\n' + end + '}';
  }
  // Pares → dict, o lista de tuplas si hay claves repetidas
  function pairsToPy(pairs) {
    const keys = pairs.map(p => p[0]);
    if (new Set(keys).size === keys.length) { const o = {}; pairs.forEach(([k, v]) => o[k] = v); return o; }
    return pairs.map(([k, v]) => ({ __tuple: true, items: [k, v] }));
  }

  /* ─── Modelo neutral de request (sirve para cURL y para pasos de la app) ── */
  // { method, url, params:[[k,v]], headers:[[k,v]], cookies:[[k,v]], json, data(str|pairs), files:[...], auth, verify, timeout, proxy, allowRedirects }
  function curlToModel(r) {
    const { base, params } = splitUrl(r.url);
    const m = { method: r.method, url: base, params, headers: r.headers.slice(), cookies: r.cookies.slice(),
      json: undefined, data: undefined, dataFile: null, files: [], auth: r.auth, verify: !r.insecure,
      timeout: r.timeout, proxy: r.proxy, warnings: r.warnings.slice() };
    const ctIdx = m.headers.findIndex(h => h[0].toLowerCase() === 'content-type');
    const ct = ctIdx >= 0 ? m.headers[ctIdx][1].toLowerCase() : '';
    if (r.form.length) {
      m.files = r.form;
      if (ctIdx >= 0 && ct.startsWith('multipart/')) m.headers.splice(ctIdx, 1); // requests pone el boundary
    } else if (r.body !== null) {
      const b = r.body;
      const single = r.data.length === 1 ? r.data[0] : null;
      if (single && !single.raw && b.startsWith('@')) { m.dataFile = b.slice(1); }
      else {
        let parsed; let isJson = false;
        if (r.dataMode === 'json' || ct.includes('json') || /^\s*[\[{]/.test(b)) { try { parsed = JSON.parse(b); isJson = true; } catch (_) {} }
        if (isJson && (typeof parsed === 'object')) {
          m.json = parsed;
          if (ctIdx >= 0 && /^application\/json\s*(;\s*charset=utf-8)?$/i.test(m.headers[ctIdx][1].trim())) m.headers.splice(ctIdx, 1);
        } else if ((!ct || ct.includes('x-www-form-urlencoded')) && looksUrlEncoded(b)) {
          m.data = parseQs(b);
          if (ctIdx >= 0 && ct.startsWith('application/x-www-form-urlencoded')) m.headers.splice(ctIdx, 1);
        } else m.data = b;
      }
    }
    return m;
  }

  /* ─── Generador Python ─────────────────────────────────────────────────── */
  function modelToPythonLines(m, o = {}) {
    const call = o.session || 'requests';
    const wrap = o.wrap || (x => x);       // p.ej. render(...) para variables
    const L = [], args = [];
    L.push('url = ' + wrap(pyStr(m.url)));
    if (m.params.length) { L.push('params = ' + wrap(pyVal(pairsToPy(m.params)))); args.push('params=params'); }
    if (m.headers.length) { L.push('headers = ' + wrap(pyVal(pairsToPy(m.headers)))); args.push('headers=headers'); }
    if (m.cookies.length) { L.push('cookies = ' + wrap(pyVal(pairsToPy(m.cookies)))); args.push('cookies=cookies'); }
    if (m.json !== undefined) {
      let j = m.json;
      if (j && typeof j === 'object' && !Array.isArray(j) && typeof j.query === 'string') {   // GraphQL
        L.push('query = ' + pyTriple(j.query));
        j = { ...j, query: { __code: true, code: 'query' } };
      }
      L.push('json_data = ' + wrap(pyVal(j))); args.push('json=json_data');
    }
    else if (m.dataFile) { L.push('data = open(' + pyStr(m.dataFile) + ', "rb").read()'); args.push('data=data'); }
    else if (m.data !== undefined) {
      L.push('data = ' + wrap(typeof m.data === 'string' ? pyStr(m.data) : pyVal(pairsToPy(m.data))));
      args.push('data=data');
    }
    if (m.files.length) {
      const items = m.files.map(f => {
        if (f.value !== undefined) return [f.key, { __tuple: true, items: [null, f.value] }];
        const fname = f.filename || f.file.split(/[\\/]/).pop();
        const opener = f.isFile ? `open(${pyStr(f.file)}, "rb")` : `open(${pyStr(f.file)}).read()`;
        const tup = f.isFile ? [fname, { __code: true, code: opener }] : [null, { __code: true, code: opener }];
        if (f.type) tup.push(f.type);
        return [f.key, { __tuple: true, items: tup }];
      });
      L.push('files = ' + wrap(pyVal(pairsToPy(items)))); args.push('files=files');
    }
    if (m.auth) args.push('auth=(' + pyStr(m.auth[0]) + ', ' + pyStr(m.auth[1]) + ')');
    if (m.proxy) { L.push('proxies = {"http": ' + pyStr(m.proxy) + ', "https": ' + pyStr(m.proxy) + '}'); args.push('proxies=proxies'); }
    if (!m.verify) args.push('verify=False');
    args.push('timeout=' + (m.timeout || 30));
    L.push('');
    L.push(`${o.respVar || 'response'} = ${call}.request(\n    ${pyStr(m.method)},\n    url,\n    ${args.join(',\n    ')},\n)`);
    return L;
  }

  /* ─── Varios cURL en un solo texto ─────────────────────────────────────── */
  /* ─── Varios cURL + filtro de ruido ─────────────────────────────────── */
  const TRACK_HOST = /(?:^|\.)((?:google(?:-analytics|tagmanager|adservices|syndication)?|doubleclick|googlesyndication|facebook|fbcdn|connect\.facebook|tiktok|hotjar|fullstory|segment|mixpanel|amplitude|sentry|newrelic|datadoghq|clarity\.ms|bing|yahoo|adsrvr|adnxs|criteo|taboola|outbrain|scorecardresearch|quantserve|mouseflow|heap|kissmetrics|optimizely|cloudflareinsights|shop\.app|monorail-edge|analytics\.shop)(?:\.[a-z]+)+)$/i;
  const ASSET_EXT = /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp4|webm|avif|pdf|wasm)(?:$|\?)/i;
  const KEEP_JS = /\/(?:cart(?:\/[\w-]+)?|products\/[^/]+|checkouts?|wallets|services\/login)\.js$/i;

  function isNoiseUrl(url) {
    let u; try { u = new URL(url); } catch (_) { return true; }
    if (TRACK_HOST.test(u.hostname)) return true;
    if (/\/(?:collect|gtag|gtm\.js|fbevents|pixel|analytics|monorail|v1\/produce)/i.test(u.pathname)) return true;
    if (ASSET_EXT.test(u.pathname) && !KEEP_JS.test(u.pathname)) return true;
    if (/\/(?:cdn\/|assets\/|static\/|_next\/|chunks\/|shopifycloud\/)/i.test(u.pathname) && ASSET_EXT.test(u.pathname)) return true;
    return false;
  }

  function splitCurls(text) {
    return String(text || '').replace(/\r\n/g, '\n')
      .split(/\n(?=[ \t]*curl(?:\.exe)?\s)/i)
      .map(s => s.trim()).filter(s => /^curl(\.exe)?\s/i.test(s))
      .filter(c => { try { return !isNoiseUrl(parseCurl(c).url); } catch (_) { return true; } });
  }

  function slug(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function fnName(m, used) {
    let path = '';
    try { path = new URL(m.url.replace(/\{\{\s*\w+\s*\}\}/g, 'x')).pathname; } catch (_) {}
    const segs = path.split('/').filter(s => s && !/^\d[\d-]*$/.test(s) && !/^v\d+$/i.test(s) && !/^(admin|api)$/i.test(s));
    let base = slug(m.method + '_' + segs.slice(-2).join('_').replace(/\.(js|json)$/i, '')) || 'request';
    if (/^\d/.test(base)) base = 'r_' + base;
    let n = base, i = 2;
    while (used.has(n)) n = base + '_' + i++;
    used.add(n);
    return n;
  }
  const key = ([k, v]) => k.toLowerCase() + '\u0000' + v;
  function common(lists) {
    if (!lists.length) return [];
    return lists[0].filter(p => lists.every(l => l.some(q => key(q) === key(p))));
  }

  function prettyGql(q) {
    if (q.includes('\n') || /["']/.test(q)) return q;
    let d = 0;
    return q.replace(/\s*([{}])\s*/g, (_, b) => b === '{' ? ' {\n' + '  '.repeat(++d) : '\n' + '  '.repeat(--d) + '}\n' + '  '.repeat(d))
      .replace(/\n\s*\n/g, '\n').replace(/\s+$/, '').replace(/,\s*/g, ', ')
      .split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
  }

  /* ─── Encadenamiento: candidatos de una respuesta ─────────────────────── */
  const SKIP_VAL = /^(true|false|null|undefined|get|post|put|patch|delete|https?|application\/\w+|text\/\w+|gzip|br|cors|same-origin|keep-alive|en-us|es-mx)$/i;
  function walkJson(v, path, fn) {
    if (v === null || v === undefined) return;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') { fn(path, v); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walkJson(x, path ? path + '.' + i : String(i), fn)); return; }
    if (typeof v === 'object') Object.keys(v).forEach(k => walkJson(v[k], path ? path + '.' + k : k, fn));
  }
  function pathToVar(path) {
    const parts = String(path).split('.').filter(p => !/^\d+$/.test(p));
    const last = parts.slice(-2).join('_') || 'VALUE';
    return slug(last).toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'VALUE';
  }
  function uniqueName(base, used) {
    let n = base, i = 2;
    while (used.has(n)) n = base + '_' + i++;
    used.add(n);
    return n;
  }

  function candidatesFromResponse(r, index) {
    const out = [];
    const hdr = (name) => {
      const e = Object.entries(r.headers || {}).find(([k]) => k.toLowerCase() === name);
      return e ? e[1] : '';
    };
    Object.entries(r.cookies_received || {}).forEach(([k, v]) => {
      if (String(v).length >= 4) out.push({ value: String(v), after: index, how: 'cookie', key: k, hint: k });
    });
    const loc = hdr('location');
    const finalUrl = r.final_url || r.url || '';
    if (loc) {
      out.push({ value: loc, after: index, how: 'location', hint: 'Location' });
      const m = loc.match(/\/checkouts?(?:\/cn)?\/([A-Za-z0-9_-]{6,})/);
      if (m) out.push({ value: m[1], after: index, how: 'location_re', re: '/checkouts?(?:/cn)?/([\\w-]+)', hint: 'checkout' });
    }
    if (finalUrl) {
      const m = finalUrl.match(/\/checkouts?(?:\/cn)?\/([A-Za-z0-9_-]{6,})/);
      if (m) out.push({ value: m[1], after: index, how: 'url_re', re: '/checkouts?(?:/cn)?/([\\w-]+)', hint: 'checkout' });
      if (/\/checkouts?\//i.test(finalUrl)) out.push({ value: finalUrl, after: index, how: 'final_url', hint: 'url' });
    }
    if (r.is_json && r.body) {
      try {
        const data = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
        walkJson(data, '', (path, val) => {
          if (typeof val === 'boolean') return;
          const s = String(val);
          if (s.length < 4 || s.length > 800 || SKIP_VAL.test(s)) return;
          const interesting = /token|id|key|secret|session|checkout|cart|variant|product|url|redirect|authenticity|csrf|hmac/i.test(path)
            || (typeof val === 'string' && s.length >= 8);
          if (!interesting && typeof val === 'number') return;
          out.push({ value: s, after: index, how: 'json', path, hint: path.split('.').pop() });
        });
      } catch (_) {}
    } else if (r.body && /<html|<form|<meta|authenticity|csrf|checkout/i.test(String(r.body).slice(0, 2000))) {
      const html = String(r.body);
      const pats = [
        [/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i, 'AUTHENTICITY_TOKEN', 'name=["\']authenticity_token["\'][^>]*value=["\']([^"\']+)["\']'],
        [/value=["']([^"']+)["'][^>]*name=["']authenticity_token["']/i, 'AUTHENTICITY_TOKEN', 'value=["\']([^"\']+)["\'][^>]*name=["\']authenticity_token["\']'],
        [/name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i, 'CSRF_TOKEN', 'name=["\']csrf-token["\'][^>]*content=["\']([^"\']+)["\']'],
        [/content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i, 'CSRF_TOKEN', 'content=["\']([^"\']+)["\'][^>]*name=["\']csrf-token["\']'],
        [/name=["']csrf[_-]token["'][^>]*value=["']([^"']+)["']/i, 'CSRF_TOKEN', 'name=["\']csrf[_-]token["\'][^>]*value=["\']([^"\']+)["\']'],
        [/name=["']x-checkout-one-session-token["'][^>]*content=["']([^"']+)["']/i, 'CHECKOUT_SESSION', 'name=["\']x-checkout-one-session-token["\'][^>]*content=["\']([^"\']+)["\']'],
        [/content=["']([^"']+)["'][^>]*name=["']x-checkout-one-session-token["']/i, 'CHECKOUT_SESSION', 'content=["\']([^"\']+)["\'][^>]*name=["\']x-checkout-one-session-token["\']'],
        [/name=["']_token["'][^>]*value=["']([^"']+)["']/i, 'FORM_TOKEN', 'name=["\']_token["\'][^>]*value=["\']([^"\']+)["\']'],
        [/data-token=["']([^"']+)["']/i, 'DATA_TOKEN', 'data-token=["\']([^"\']+)["\']'],
        [/name=["']id["'][^>]*value=["'](\d{5,})["']/i, 'VARIANT_ID', 'name=["\']id["\'][^>]*value=["\'](\\d+)["\']'],
      ];
      pats.forEach(([re, name, pyRe]) => {
        const m = html.match(re);
        if (m) out.push({ value: m[1], after: index, how: 'html', re: pyRe, nameHint: name, hint: name.toLowerCase().replace(/_/g, ' ') });
      });
    }
    return out;
  }

  function modelBlob(m) {
    const parts = [m.url];
    m.headers.forEach(([k, v]) => parts.push(k, v));
    m.cookies.forEach(([k, v]) => parts.push(k, v));
    if (m.json !== undefined) parts.push(JSON.stringify(m.json));
    else if (typeof m.data === 'string') parts.push(m.data);
    else if (Array.isArray(m.data)) m.data.forEach(([k, v]) => parts.push(k, v));
    (m.files || []).forEach(f => { parts.push(f.key); if (f.value !== undefined) parts.push(f.value); });
    return parts.join('\n');
  }

  function replaceInModel(m, value, varName) {
    const ph = '{{' + varName + '}}';
    const swap = s => String(s).split(value).join(ph);
    m.url = swap(m.url);
    m.headers = m.headers.map(([k, v]) => [k, swap(v)]);
    m.cookies = m.cookies.map(([k, v]) => [k, swap(v)]);
    if (typeof m.data === 'string') m.data = swap(m.data);
    else if (Array.isArray(m.data)) m.data = m.data.map(([k, v]) => [k, String(v) === String(value) ? ph : swap(v)]);
    if (m.json !== undefined) {
      m.json = JSON.parse(JSON.stringify(m.json), (k, v) => {
        if (v === value || (typeof v !== 'object' && v !== null && String(v) === String(value))) return ph;
        if (typeof v === 'string' && value && v.includes(value)) return v.split(value).join(ph);
        return v;
      });
    }
    (m.files || []).forEach(f => { if (f.value !== undefined) f.value = String(f.value) === String(value) ? ph : swap(f.value); });
  }

  function dropSessionCookies(models, responses) {
    const set = new Set();
    (responses || []).forEach(r => Object.keys(r.cookies_received || {}).forEach(k => set.add(k.toLowerCase())));
    // Also drop cookies that appear after an earlier request on same host without being in the first request
    models.forEach((m, i) => {
      if (!i) return;
      m.cookies = m.cookies.filter(([k]) => {
        const kl = k.toLowerCase();
        // cookie set by any earlier response → session
        if (set.has(kl)) return false;
        for (let j = 0; j < i; j++) {
          const prev = responses && responses[j];
          if (prev && prev.cookies_received && Object.keys(prev.cookies_received).some(x => x.toLowerCase() === kl)) return false;
        }
        return true;
      });
    });
  }

  /* Heurísticas Shopify sin haber ejecutado todavía */
  function shopifyHints(models) {
    const extracts = [], used = new Set();
    models.forEach((m, i) => {
      let path = '';
      try { path = new URL(m.url.replace(/\{\{[^}]+\}\}/g, 'x')).pathname; } catch (_) {}
      // /cart.js → token en JSON
      if (/\/cart\.js$/i.test(path) && m.method === 'GET') {
        for (let j = i + 1; j < models.length; j++) {
          const blob = modelBlob(models[j]);
          // no value yet — skip until run; only mark structural for cart token key in body
        }
      }
      // authenticity_token en body de un POST posterior a un GET HTML
      if (m.method === 'GET') {
        for (let j = i + 1; j < models.length; j++) {
          const later = models[j];
          const pairs = Array.isArray(later.data) ? later.data : [];
          const auth = pairs.find(([k]) => /authenticity_token/i.test(k));
          if (auth && auth[1] && auth[1].length > 8) {
            const name = uniqueName('AUTHENTICITY_TOKEN', used);
            extracts.push({ after: i, name, how: 'html', re: 'name=["\']authenticity_token["\'][^>]*value=["\']([^"\']+)["\']', hint: 'token', to: j });
            replaceInModel(later, auth[1], name);
          }
          const csrf = later.headers.find(([k]) => /x-csrf|csrf-token/i.test(k));
          if (csrf && csrf[1].length > 8) {
            const name = uniqueName('CSRF_TOKEN', used);
            extracts.push({ after: i, name, how: 'html', re: 'name=["\']csrf-token["\'][^>]*content=["\']([^"\']+)["\']', hint: 'csrf', to: j });
            replaceInModel(later, csrf[1], name);
          }
          const sess = later.headers.find(([k]) => /x-checkout-one-session-token/i.test(k));
          if (sess && sess[1].length > 8) {
            const name = uniqueName('CHECKOUT_SESSION', used);
            extracts.push({ after: i, name, how: 'html', re: 'name=["\']x-checkout-one-session-token["\'][^>]*content=["\']([^"\']+)["\']', hint: 'session', to: j });
            replaceInModel(later, sess[1], name);
          }
        }
      }
      // variant id en form
      if (/\/cart\/add/i.test(path) || /\/cart\/add\.js$/i.test(path)) {
        const id = (m.json && (m.json.id || (m.json.items && m.json.items[0] && m.json.items[0].id)))
          || (Array.isArray(m.data) && (m.data.find(([k]) => k === 'id') || [])[1]);
        if (id) {
          for (let j = 0; j < i; j++) {
            if (models[j].method !== 'GET') continue;
            // will refine on run if HTML has the id
          }
        }
      }
      // checkout URL / token en path
      const cm = path.match(/\/checkouts?(?:\/cn)?\/([A-Za-z0-9_-]{8,})/);
      if (cm) {
        for (let j = 0; j < i; j++) {
          let pj = '';
          try { pj = new URL(models[j].url.replace(/\{\{[^}]+\}\}/g, 'x')).pathname; } catch (_) {}
          if (/\/checkout\/?$/i.test(pj) || /\/cart\/?$/i.test(pj) || /\/cart\.js$/i.test(pj)) {
            const name = uniqueName('CHECKOUT_TOKEN', used);
            extracts.push({ after: j, name, how: 'final_url_re', re: '/checkouts?(?:/cn)?/([\\w-]+)', hint: 'checkout', to: i });
            replaceInModel(m, cm[1], name);
            break;
          }
        }
      }
    });
    // Drop cookies that look session-set (cart, _secure, secure_session, checkout_token) after first use of cart/add
    let cartAdd = -1;
    models.forEach((m, i) => {
      let path = '';
      try { path = new URL(m.url.replace(/\{\{[^}]+\}\}/g, 'x')).pathname; } catch (_) {}
      if (/\/cart\/add/i.test(path)) cartAdd = i;
      if (cartAdd >= 0 && i > cartAdd) {
        m.cookies = m.cookies.filter(([k]) => !/^(cart|_secure_session_id|secure_customer_sig|checkout_token|_shopify_s|_shopify_y|_tracking_consent)$/i.test(k));
      }
    });
    return extracts;
  }

  function replaceField(m, field, varName) {
    const ph = '{{' + varName + '}}';
    let hit = false;
    const fl = field.toLowerCase();
    m.headers = m.headers.map(([k, v]) => {
      if (k.toLowerCase() === fl && v && !String(v).includes('{{')) { hit = true; return [k, ph]; }
      return [k, v];
    });
    m.cookies = m.cookies.map(([k, v]) => {
      if (k.toLowerCase() === fl && v && !String(v).includes('{{')) { hit = true; return [k, ph]; }
      return [k, v];
    });
    if (Array.isArray(m.data)) {
      m.data = m.data.map(([k, v]) => {
        if (k.toLowerCase() === fl && v && !String(v).includes('{{')) { hit = true; return [k, ph]; }
        return [k, v];
      });
    } else if (typeof m.data === 'string' && m.data.includes(field + '=')) {
      const re = new RegExp('((?:^|[&])' + field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=)[^&]*', 'i');
      if (re.test(m.data)) { m.data = m.data.replace(re, '$1' + ph); hit = true; }
    }
    if (m.json && typeof m.json === 'object') {
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        Object.keys(o).forEach(k => {
          if (k.toLowerCase() === fl && o[k] !== undefined && !String(o[k]).includes('{{')) { o[k] = ph; hit = true; }
          else walk(o[k]);
        });
      };
      walk(m.json);
    }
    return hit;
  }

  function replaceCheckoutPath(m, varName) {
    const re = /(\/checkouts?(?:\/cn)?)\/[A-Za-z0-9_-]+/;
    if (!re.test(m.url) || m.url.includes('{{')) return false;
    m.url = m.url.replace(re, '$1/{{' + varName + '}}');
    return true;
  }

  function chainFromRun(cmds, responses) {
    const models = cmds.map(c => curlToModel(parseCurl(c)));
    dropSessionCookies(models, responses);
    const usedNames = new Set(), extracts = [], links = [];
    const addLink = (name, from, to, hint) => {
      if (!links.some(l => l.name === name && l.to === to)) links.push({ name, from: from + 1, to: to + 1, hint });
    };

    // 1) Literal matches (HAR with consistent values)
    const allCands = [];
    (responses || []).forEach((r, i) => allCands.push(...candidatesFromResponse(r, i)));
    allCands.sort((a, b) => b.value.length - a.value.length);
    const usedValues = new Set();
    allCands.forEach(c => {
      if (c.how === 'cookie' || c.value.length < 6 || usedValues.has(c.value) || SKIP_VAL.test(c.value)) return;
      if (/^(final_url|location|url_re|location_re|final_url_re)$/.test(c.how)) return; // path tokens handled structurally
      if (/^\d+$/.test(c.value) && c.value.length < 8 && !/id$/i.test(c.path || '')) return;
      let name = null;
      for (let j = c.after + 1; j < models.length; j++) {
        if (!modelBlob(models[j]).includes(c.value)) continue;
        if (!name) {
          name = uniqueName(c.nameHint || pathToVar(c.path || c.hint || 'VALUE'), usedNames);
          extracts.push({ ...c, name });
          usedValues.add(c.value);
        }
        replaceInModel(models[j], c.value, name);
        addLink(name, c.after, j, c.hint || name.toLowerCase());
      }
    });

    // 2) Structural Shopify / form chaining (works with stale recorded tokens)
    const AUTH_RE = 'name=["\']authenticity_token["\'][^>]*value=["\']([^"\']+)["\']';
    const AUTH_RE2 = 'value=["\']([^"\']+)["\'][^>]*name=["\']authenticity_token["\']';
    const CSRF_RE = 'name=["\']csrf-token["\'][^>]*content=["\']([^"\']+)["\']';
    const SESS_RE = 'name=["\']x-checkout-one-session-token["\'][^>]*content=["\']([^"\']+)["\']';
    const SESS_RE2 = 'content=["\']([^"\']+)["\'][^>]*name=["\']x-checkout-one-session-token["\']';
    const VARIANT_RE = 'name=["\']id["\'][^>]*value=["\'](\\d+)["\']';

    (responses || []).forEach((r, i) => {
      const body = String(r.body || '');
      const html = !r.is_json && /<html|<form|<meta|authenticity|csrf|checkout/i.test(body.slice(0, 4000));

      if (html) {
        const tryHtml = (re, base, fields, hint) => {
          if (!new RegExp(re, 'i').test(body)) return;
          if (extracts.some(e => e.after === i && e.name.startsWith(base))) return;
          let hit = false; let name = null;
          for (let j = i + 1; j < models.length; j++) {
            let local = false;
            fields.forEach(f => { if (replaceField(models[j], f, name || base)) local = true; });
            if (!local) continue;
            if (!name) {
              name = uniqueName(base, usedNames);
              // rewrite placeholders that used base before name finalized
              for (let k = i + 1; k <= j; k++) replaceInModel(models[k], '{{' + base + '}}', name);
              extracts.push({ after: i, name, how: 'html', re, hint });
            } else {
              fields.forEach(f => replaceField(models[j], f, name));
            }
            hit = true; addLink(name, i, j, hint);
          }
          // redo properly: if we used base as temp ph, fix
        };
        // authenticity
        if (/authenticity_token/i.test(body) && !extracts.some(e => e.name.startsWith('AUTHENTICITY_TOKEN'))) {
          let name = null;
          for (let j = i + 1; j < models.length; j++) {
            const blob = modelBlob(models[j]);
            if (!/authenticity_token/i.test(blob) || /\{\{AUTHENTICITY_TOKEN/.test(blob)) continue;
            if (!name) {
              name = uniqueName('AUTHENTICITY_TOKEN', usedNames);
              extracts.push({ after: i, name, how: 'html', re: AUTH_RE, hint: 'token' });
            }
            replaceField(models[j], 'authenticity_token', name);
            addLink(name, i, j, 'token');
          }
        }
        if (/csrf-token/i.test(body)) {
          let name = null;
          for (let j = i + 1; j < models.length; j++) {
            const has = models[j].headers.some(([k, v]) => /csrf/i.test(k) && v && !String(v).includes('{{'));
            if (!has) continue;
            if (!name) {
              name = uniqueName('CSRF_TOKEN', usedNames);
              extracts.push({ after: i, name, how: 'html', re: CSRF_RE, hint: 'csrf' });
            }
            models[j].headers.forEach((h, idx) => {
              if (/csrf/i.test(h[0]) && h[1] && !String(h[1]).includes('{{')) models[j].headers[idx] = [h[0], '{{' + name + '}}'];
            });
            addLink(name, i, j, 'csrf');
          }
        }
        if (/x-checkout-one-session-token/i.test(body)) {
          // Always take the latest page that exposes the session (overwrite earlier links)
          let name = extracts.find(e => e.name === 'CHECKOUT_SESSION')?.name;
          let touched = false;
          for (let j = i + 1; j < models.length; j++) {
            const hasHdr = models[j].headers.some(([k]) => /x-checkout-one-session-token/i.test(k));
            if (!hasHdr) continue;
            if (!name) {
              name = uniqueName('CHECKOUT_SESSION', usedNames);
              extracts.push({ after: i, name, how: 'html', re: SESS_RE, hint: 'session' });
            } else {
              // move extract source to this later page
              const ex = extracts.find(e => e.name === name);
              if (ex) ex.after = i;
              // clear prior links for this name
              for (let k = links.length - 1; k >= 0; k--) if (links[k].name === name) links.splice(k, 1);
            }
            models[j].headers = models[j].headers.map(([k, v]) =>
              /x-checkout-one-session-token/i.test(k) ? [k, '{{' + name + '}}'] : [k, v]);
            addLink(name, i, j, 'session');
            touched = true;
          }
        }
        if (/name=["']id["']/i.test(body) && !extracts.some(e => e.name.startsWith('VARIANT_ID'))) {
          let name = null;
          for (let j = i + 1; j < models.length; j++) {
            let path = ''; try { path = new URL(models[j].url.replace(/\{\{[^}]+\}\}/g, 'x')).pathname; } catch (_) {}
            if (!/\/cart\/add/i.test(path)) continue;
            const needs = (models[j].json && (models[j].json.id || (models[j].json.items && models[j].json.items[0])))
              || (Array.isArray(models[j].data) && models[j].data.some(([k]) => k === 'id'));
            if (!needs) continue;
            if (!name) {
              name = uniqueName('VARIANT_ID', usedNames);
              extracts.push({ after: i, name, how: 'html', re: VARIANT_RE, hint: 'variant' });
            }
            if (models[j].json) {
              if (models[j].json.id !== undefined && !String(models[j].json.id).includes('{{')) models[j].json.id = '{{' + name + '}}';
              (models[j].json.items || []).forEach(it => { if (it && it.id !== undefined && !String(it.id).includes('{{')) it.id = '{{' + name + '}}'; });
            }
            if (Array.isArray(models[j].data)) models[j].data = models[j].data.map(([k, v]) => k === 'id' && !String(v).includes('{{') ? [k, '{{' + name + '}}'] : [k, v]);
            addLink(name, i, j, 'variant');
          }
        }
      }

      // checkout token from redirect / final URL (only when this step navigated INTO checkout)
      const finalUrl = r.final_url || '';
      const loc = Object.entries(r.headers || {}).find(([k]) => k.toLowerCase() === 'location');
      const src = (loc && loc[1]) || finalUrl;
      const reqUrl = (cmds[i] && (curlToModel(parseCurl(cmds[i])).url)) || '';
      let reqPath = ''; try { reqPath = new URL(reqUrl).pathname; } catch (_) {}
      const navigated = /\/checkout\/?$/i.test(reqPath) || /\/cart\/?$/i.test(reqPath) || (loc && /checkout/i.test(loc[1]));
      const cm = src.match(/\/checkouts?(?:\/cn)?\/([A-Za-z0-9_-]{6,})/);
      if (navigated && cm && !extracts.some(e => e.name.startsWith('CHECKOUT_TOKEN'))) {
        let name = null;
        for (let j = i + 1; j < models.length; j++) {
          if (!/\/checkouts?(?:\/cn)?\/[A-Za-z0-9_-]+/.test(models[j].url) || /\{\{\s*CHECKOUT_TOKEN/.test(models[j].url)) continue;
          if (!name) {
            name = uniqueName('CHECKOUT_TOKEN', usedNames);
            extracts.push({
              after: i, name, how: 'final_url_re',
              re: '/checkouts?(?:/cn)?/([\\w-]+)', hint: 'checkout'
            });
          }
          replaceCheckoutPath(models[j], name);
          addLink(name, i, j, 'checkout');
        }
      }

      // cart.js JSON token
      if (r.is_json && body) {
        try {
          const data = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
          if (data && typeof data.token === 'string' && data.token.length >= 6) {
            let name = null;
            for (let j = i + 1; j < models.length; j++) {
              if (!modelBlob(models[j]).includes(data.token) && !replaceField(models[j], 'token', name || 'CART_TOKEN')) {
                // try literal only
                continue;
              }
              if (!name) {
                name = uniqueName('CART_TOKEN', usedNames);
                extracts.push({ after: i, name, how: 'json', path: 'token', hint: 'token' });
              }
              if (modelBlob(models[j]).includes(data.token)) replaceInModel(models[j], data.token, name);
              replaceField(models[j], 'token', name);
              addLink(name, i, j, 'token');
            }
          }
        } catch (_) {}
      }
    });

    // Prefer earliest extract for same logical field in a model (cleanup duplicate placeholders)
    // Drop extract entries that nothing linked to
    const linked = new Set(links.map(l => l.name));
    const ex2 = extracts.filter(e => linked.has(e.name));

    return { models, extracts: ex2, links, python: modelsToPython(models, ex2) };
  }

  function extractCode(e) {
    if (e.how === 'json') {
      const parts = String(e.path).split('.');
      let expr = 'r.json()';
      parts.forEach(p => { expr += /^\d+$/.test(p) ? '[' + p + ']' : '[' + JSON.stringify(p) + ']'; });
      return e.name + ' = ' + expr;
    }
    if (e.how === 'location') return e.name + ' = r.headers.get("Location") or r.url';
    if (e.how === 'final_url') return e.name + ' = r.url';
    if (e.how === 'location_re' || e.how === 'final_url_re' || e.how === 'url_re') {
      const src = e.how === 'location_re' ? '(r.headers.get("Location") or "")' : 'r.url';
      return e.name + ' = (re.search(' + JSON.stringify(e.re) + ', ' + src + ') or [None, ""])[1]';
    }
    if (e.how === 'html') {
      return e.name + ' = (re.search(' + JSON.stringify(e.re) + ', r.text) or [None, ""])[1]';
    }
    if (e.how === 'cookie') return e.name + ' = s.cookies.get(' + JSON.stringify(e.key) + ')';
    return e.name + ' = ""';
  }

  function modelsToPython(models, extracts = []) {
    if (!models.length) return '';
    const vars = {};
    models.forEach(m => autoVars(m).forEach(([k, v]) => {
      if (!(k in vars)) vars[k] = v;
      else if (vars[k] !== v) {
        const back = x => x.split('{{' + k + '}}').join(v);
        m.url = back(m.url); m.headers = m.headers.map(([a, b]) => [a, back(b)]);
      }
    }));
    if (vars.SHOP) models.forEach(m => {
      const swap = v => v.split('//' + vars.SHOP).join('//{{SHOP}}');
      m.url = swap(m.url);
      m.headers = m.headers.map(([k, v]) => [k, /^(origin|referer)$/i.test(k) ? swap(v) : v]);
    });

    const H = common(models.map(m => m.headers)), C = common(models.map(m => m.cookies));
    models.forEach(m => {
      m.headers = m.headers.filter(p => !H.some(q => key(q) === key(p)));
      m.cookies = m.cookies.filter(p => !C.some(q => key(q) === key(p)));
    });

    const used = new Set(), queries = [];
    const byAfter = {};
    extracts.forEach(e => { (byAfter[e.after] = byAfter[e.after] || []).push(e); });

    const fns = models.map(m => {
      const name = fnName(m, used);
      const j = m.json;
      if (j && typeof j === 'object' && !Array.isArray(j) && typeof j.query === 'string') {
        const q = name.toUpperCase() + '_QUERY';
        queries.push([q, prettyGql(j.query)]);
        m.json = { ...j, query: { __code: true, code: q } };
      }
      return { name, m };
    });

    const extractNames = extracts.map(e => e.name);
    const needRe = extracts.some(e => /html|location_re|final_url_re|url_re/.test(e.how));

    FSTR = new Set([...Object.keys(vars), ...extractNames]);
    try {
      const L = ['import requests'];
      if (needRe) L.push('import re');
      if (models.some(m => !m.verify)) L.push('import urllib3', '', 'urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)');
      L.push('');
      Object.entries(vars).forEach(([k, v]) => L.push(k + ' = ' + JSON.stringify(v)));
      extractNames.forEach(n => L.push(n + ' = ""'));
      if (H.length) L.push('HEADERS = ' + pyVal(pairsToPy(H)));
      if (C.length) L.push('COOKIES = ' + pyVal(pairsToPy(C)));
      queries.forEach(([q, s]) => L.push('', q + ' = ' + pyTriple(s)));
      fns.forEach(({ name, m }, i) => {
        L.push('', '');
        (m.warnings || []).forEach(w => L.push('# ' + w));
        L.push('def ' + name + '(s):');
        const ex = byAfter[i] || [];
        if (ex.length) L.push('    global ' + ex.map(e => e.name).join(', '));
        modelToPythonLines(m, { session: 's', respVar: 'r' })
          .forEach(x => L.push(x ? x.split('\n').map(y => '    ' + y).join('\n') : ''));
        ex.forEach(e => L.push('    ' + extractCode(e)));
        L.push('    return r');
      });
      L.push('', '',
        'def show(r):',
        '    print(r.status_code, r.request.method, r.url)',
        '    print(r.text[:2000])',
        '    print()',
        '', '',
        'def main():',
        '    s = requests.Session()');
      if (H.length) L.push('    s.headers.update(HEADERS)');
      if (C.length) L.push('    s.cookies.update(COOKIES)');
      L.push('    for step in (' + fns.map(f => f.name).join(', ') + (fns.length === 1 ? ',' : '') + '):',
        '        show(step(s))',
        '', '',
        'if __name__ == "__main__":',
        '    main()');
      return L.join('\n') + '\n';
    } finally { FSTR = null; }
  }

  function curlsToPython(text) {
    const cmds = splitCurls(text);
    if (!cmds.length) return '';
    const models = cmds.map(c => curlToModel(parseCurl(c)));
    const extracts = shopifyHints(models);
    return modelsToPython(models, extracts);
  }

  function chainLinksFor(cmds) {
    const models = cmds.map(c => curlToModel(parseCurl(c)));
    const extracts = shopifyHints(models);
    return extracts.filter(e => e.to != null).map(e => ({
      name: e.name, from: e.after + 1, to: e.to + 1, hint: e.hint || e.name.toLowerCase()
    }));
  }

  /* ─── Request listo para ejecutar en el servidor ───────────────────────── */
  function curlToWire(cmd) {
    const r = parseCurl(cmd);
    const headers = r.headers.slice();
    if (r.cookies.length) headers.push(['Cookie', r.cookies.map(([k, v]) => k + '=' + v).join('; ')]);
    if (r.auth) headers.push(['Authorization', 'Basic ' + b64(r.auth[0] + ':' + r.auth[1])]);
    const w = { method: r.method, url: r.url, headers, insecure: r.insecure };
    if (r.form.length) {
      w.form = r.form.filter(f => f.value !== undefined).map(f => [f.key, f.value]);
      w.headers = w.headers.filter(h => !/^content-type$/i.test(h[0]));
    } else if (r.body !== null) w.body = r.body;
    return w;
  }
  function b64(s) {
    if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(s)));
  }

  const API = { tokenize, parseCurl, curlToModel, splitCurls, curlsToPython, curlToWire, chainFromRun, chainLinksFor, isNoiseUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Curl2Py = API;
})(typeof window !== 'undefined' ? window : globalThis);
