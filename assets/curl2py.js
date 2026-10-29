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
  function splitCurls(text) {
    return String(text || '').replace(/\r\n/g, '\n')
      .split(/\n(?=[ \t]*curl(?:\.exe)?\s)/i)
      .map(s => s.trim()).filter(s => /^curl(\.exe)?\s/i.test(s));
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

  // GraphQL en una sola línea → indentado por llaves (si no tiene strings)
  function prettyGql(q) {
    if (q.includes('\n') || /["']/.test(q)) return q;
    let d = 0;
    return q.replace(/\s*([{}])\s*/g, (_, b) => b === '{' ? ' {\n' + '  '.repeat(++d) : '\n' + '  '.repeat(--d) + '}\n' + '  '.repeat(d))
      .replace(/\n\s*\n/g, '\n').replace(/\s+$/, '').replace(/,\s*/g, ', ')
      .split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
  }

  /* ─── Script Python a partir de uno o varios cURL ──────────────────────── */
  function curlsToPython(text) {
    const cmds = splitCurls(text);
    if (!cmds.length) return '';
    const models = cmds.map(c => curlToModel(parseCurl(c)));

    // Variables (SHOP, TOKEN…): la primera gana; si otro request trae otro valor queda literal
    const vars = {};
    models.forEach(m => autoVars(m).forEach(([k, v]) => {
      if (!(k in vars)) vars[k] = v;
      else if (vars[k] !== v) {
        const back = x => x.split('{{' + k + '}}').join(v);
        m.url = back(m.url); m.headers = m.headers.map(([a, b]) => [a, back(b)]);
      }
    }));

    if (vars.SHOP) models.forEach(m => {   // mismo dominio en los demás requests
      const swap = v => v.split('//' + vars.SHOP).join('//{{SHOP}}');
      m.url = swap(m.url);
      m.headers = m.headers.map(([k, v]) => [k, /^(origin|referer)$/i.test(k) ? swap(v) : v]);
    });

    // Headers y cookies repetidos en todos los requests → sesión
    const H = common(models.map(m => m.headers)), C = common(models.map(m => m.cookies));
    models.forEach(m => {
      m.headers = m.headers.filter(p => !H.some(q => key(q) === key(p)));
      m.cookies = m.cookies.filter(p => !C.some(q => key(q) === key(p)));
    });

    const used = new Set(), queries = [];
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

    FSTR = new Set(Object.keys(vars));
    try {
      const L = ['import requests'];
      if (models.some(m => !m.verify)) L.push('import urllib3', '', 'urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)');
      L.push('');
      Object.entries(vars).forEach(([k, v]) => L.push(k + ' = ' + JSON.stringify(v)));
      if (H.length) L.push('HEADERS = ' + pyVal(pairsToPy(H)));
      if (C.length) L.push('COOKIES = ' + pyVal(pairsToPy(C)));
      queries.forEach(([q, s]) => L.push('', q + ' = ' + pyTriple(s)));
      fns.forEach(({ name, m }) => {
        L.push('', '');
        (m.warnings || []).forEach(w => L.push('# ' + w));
        L.push('def ' + name + '(s):');
        modelToPythonLines(m, { session: 's', respVar: 'r' })
          .forEach(x => L.push(x ? x.split('\n').map(y => '    ' + y).join('\n') : ''));
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

  const API = { tokenize, parseCurl, curlToModel, splitCurls, curlsToPython, curlToWire };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Curl2Py = API;
})(typeof window !== 'undefined' ? window : globalThis);
