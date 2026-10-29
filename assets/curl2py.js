/* ═══════════════════════════════════════════════════════════════════════════
 * curl2py.js — Conversor cURL (bash) → Python (requests) + exportador de
 * colecciones a script Python. Sin dependencias. Funciona en navegador y Node.
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
  function pyStr(s) {
    // JSON string escaping es válido en Python, salvo U+2028/2029 que JSON.stringify deja tal cual (también válido)
    return JSON.stringify(String(s));
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
    if (m.json !== undefined) { L.push('json_data = ' + wrap(pyVal(m.json))); args.push('json=json_data'); }
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

  function modelToPython(m) {
    const L = ['import requests'];
    if (!m.verify) L.push('import urllib3', '', 'urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)');
    L.push('');
    (m.warnings || []).forEach(w => L.push('# Nota: ' + w));
    L.push(...modelToPythonLines(m));
    L.push('', 'print(response.status_code)', 'try:', '    print(response.json())', 'except ValueError:', '    print(response.text)');
    return L.join('\n') + '\n';
  }

  function curlToPython(cmd) { return modelToPython(curlToModel(parseCurl(cmd))); }
  function isCurl(s) { return /^\s*curl(\.exe)?\s/i.test(String(s || '')); }

  /* ─── Integración con los pasos de la app ──────────────────────────────── */
  // cURL → paso de la app (formato de app.js)
  function curlToStep(cmd, name) {
    const r = parseCurl(cmd);
    const headers = r.headers.map(([key, value]) => ({ key, value }));
    if (r.cookies.length) headers.push({ key: 'Cookie', value: r.cookies.map(([k, v]) => k + '=' + v).join('; ') });
    if (r.auth) headers.push({ key: 'Authorization', value: 'Basic ' + b64(r.auth[0] + ':' + r.auth[1]) });
    const st = { name: name || autoName(r), method: r.method, url: r.url, headers, body: '', body_type: 'none',
      form_fields: [], php_code: null, timeout: r.timeout || 30, proxy: r.proxy || '', chain_extracts: [], insecure: r.insecure };
    if (r.form.length) {
      st.body_type = 'form';
      st.form_fields = r.form.map(f => ({ key: f.key, value: f.value !== undefined ? f.value : '@' + f.file }));
      st.headers = st.headers.filter(h => !(h.key.toLowerCase() === 'content-type' && /multipart/i.test(h.value)));
    } else if (r.body !== null) {
      const ct = (headers.find(h => h.key.toLowerCase() === 'content-type') || {}).value || '';
      let isJson = false; try { JSON.parse(r.body); isJson = /^\s*[\[{]/.test(r.body); } catch (_) {}
      if (isJson || /json/i.test(ct)) { st.body_type = isJson ? 'json' : 'raw'; st.body = isJson ? JSON.stringify(JSON.parse(r.body), null, 2) : r.body; }
      else if (looksUrlEncoded(r.body)) { st.body_type = 'urlenc'; st.body = r.body.split('&').join('\n'); }
      else { st.body_type = 'raw'; st.body = r.body; }
    }
    return st;
  }
  function autoName(r) {
    try { const u = new URL(r.url); const p = u.pathname.split('/').filter(Boolean).pop(); return r.method + ' ' + (p || u.host); } catch (_) { return r.method; }
  }
  function b64(s) {
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)));
    return Buffer.from(s, 'utf8').toString('base64');
  }

  // Paso de la app → modelo
  function stepToModel(s) {
    const { base, params } = splitUrl((s.url || '').trim());
    const m = { method: (s.method || 'GET').toUpperCase(), url: base, params, headers: [], cookies: [], json: undefined,
      data: undefined, dataFile: null, files: [], auth: null, verify: !s.insecure, timeout: s.timeout || 30, proxy: s.proxy || '', warnings: [] };
    (s.headers || []).filter(h => h.key).forEach(h => {
      if (h.key.toLowerCase() === 'cookie') m.cookies.push(...parseCookieStr(h.value)); else m.headers.push([h.key, h.value]);
    });
    const bt = s.body_type || 'none', body = (s.body || '').trim();
    const dropCt = re => { const i = m.headers.findIndex(h => h[0].toLowerCase() === 'content-type' && re.test(h[1])); if (i >= 0) m.headers.splice(i, 1); };
    if (bt === 'form') {
      m.files = (s.form_fields || []).filter(f => f.key).map(f =>
        String(f.value).startsWith('@') ? { key: f.key, file: f.value.slice(1), isFile: true } : { key: f.key, value: f.value });
      dropCt(/multipart|json/i);
    } else if (bt === 'json' && body) {
      try { m.json = JSON.parse(body); dropCt(/^application\/json\s*(;\s*charset=utf-8)?$/i); } catch (_) { m.data = body; }
    } else if (bt === 'urlenc' && body) {
      const pairs = body.split(/\n|&/).map(l => l.trim()).filter(Boolean).map(l => { const k = l.indexOf('='); return k < 0 ? [l, ''] : [l.slice(0, k), l.slice(k + 1)]; });
      m.data = pairs; dropCt(/x-www-form-urlencoded|json/i);
    } else if (bt === 'raw' && body) m.data = body;
    else if (bt === 'none') dropCt(/^application\/json$/i);  // header por defecto sin body: innecesario
    return m;
  }
  function stepToPython(s) { return modelToPython(stepToModel(s)); }

  /* ─── Colección completa → script Python de automatización ──────────────── */
  function collectionToPython(c, opts = {}) {
    const steps = c.steps || [];
    const env = c.env || [];
    const anyInsecure = steps.some(s => s.insecure);
    const L = [
      '#!/usr/bin/env python3',
      '"""',
      'Automatización: ' + String(c.name || 'Sin nombre').replace(/"""/g, "'''"),
      'Generado por API Builder — ' + new Date().toISOString().slice(0, 10),
      '',
      'Uso:  pip install requests  &&  python ' + slug(c.name || 'flujo') + '.py',
      'Variables: edita VARS abajo o pásalas por entorno, p.ej.  TOKEN=abc python script.py',
      '"""',
      'import json',
      'import os',
      'import re',
      'import sys',
      'import time',
      '',
      'import requests',
    ];
    if (anyInsecure) L.push('import urllib3', '', 'urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)');
    const vars = {}; env.filter(e => e.key).forEach(e => vars[e.key] = e.value);
    L.push('',
      '# ── Variables ({{NOMBRE}} en URL, headers o body) ─────────────────────────',
      'VARS = ' + pyVal(vars),
      '# Las variables de entorno del sistema sobrescriben VARS',
      'VARS.update({k: v for k, v in os.environ.items() if k in VARS})',
      '',
      'STOP_ON_ERROR = ' + (opts.stopOnError === false ? 'False' : 'True'),
      'DELAY_SECONDS = ' + (Number(opts.delay) || 0),
      '',
      'session = requests.Session()  # comparte cookies entre pasos',
      '',
      '',
      'def render(value):',
      '    """Sustituye {{VAR}} recursivamente en str / dict / list."""',
      '    if isinstance(value, str):',
      '        return re.sub(r"\\{\\{\\s*([^}]+?)\\s*\\}\\}", lambda m: str(VARS.get(m.group(1), m.group(0))), value)',
      '    if isinstance(value, dict):',
      '        return {render(k): render(v) for k, v in value.items()}',
      '    if isinstance(value, (list, tuple)):',
      '        return type(value)(render(v) for v in value)',
      '    return value',
      '',
      '',
      'def extract(response, path):',
      '    """Extrae un valor: "data.items.0.id" (JSON), "header:X-Token", "cookie:session" o "regex:token=(\\\\w+)"."""',
      '    if path.startswith("header:"):',
      '        return response.headers.get(path[7:].strip())',
      '    if path.startswith("cookie:"):',
      '        return session.cookies.get(path[7:].strip())',
      '    if path.startswith("regex:"):',
      '        m = re.search(path[6:], response.text)',
      '        return (m.group(1) if m.groups() else m.group(0)) if m else None',
      '    try:',
      '        cur = response.json()',
      '    except ValueError:',
      '        return None',
      '    for part in path.split("."):',
      '        if isinstance(cur, list) and part.lstrip("-").isdigit():',
      '            idx = int(part)',
      '            cur = cur[idx] if -len(cur) <= idx < len(cur) else None',
      '        elif isinstance(cur, dict):',
      '            cur = cur.get(part)',
      '        else:',
      '            return None',
      '        if cur is None:',
      '            return None',
      '    return cur if isinstance(cur, str) else json.dumps(cur, ensure_ascii=False) if isinstance(cur, (dict, list)) else str(cur)',
      '',
      '',
      'def show(name, response):',
      '    print(f"\\n=== {name} -> {response.status_code} ({response.elapsed.total_seconds() * 1000:.0f} ms) ===")',
      '    try:',
      '        print(json.dumps(response.json(), indent=2, ensure_ascii=False)[:2000])',
      '    except ValueError:',
      '        print(response.text[:2000])',
      '');
    const fnames = [];
    steps.forEach((s, i) => {
      const fn = 'paso_' + (i + 1) + '_' + slug(s.name || '').slice(0, 30);
      const fname = fn.replace(/_+$/, '');
      fnames.push([fname, s.name || 'Paso ' + (i + 1)]);
      L.push('', 'def ' + fname + '():');
      const body = [];
      if (!(s.url || '').trim()) body.push('# URL vacía', 'return None');
      else {
        body.push(...modelToPythonLines(stepToModel(s), { session: 'session', wrap: x => 'render(' + x + ')' }).flatMap(l => l.split('\n')));
        body.push('show(' + pyStr(s.name || 'Paso ' + (i + 1)) + ', response)');
        (s.chain_extracts || []).filter(e => e.var && e.path).forEach(e =>
          body.push('VARS[' + pyStr(e.var) + '] = extract(response, ' + pyStr(e.path) + ')',
                    'print("  " + ' + pyStr(e.var) + ' + " =", VARS[' + pyStr(e.var) + '])'));
        body.push('return response');
      }
      body.forEach(l => L.push(l ? '    ' + l : ''));
      L.push('');
    });
    L.push('', 'STEPS = [', ...fnames.map(([f, n]) => '    (' + pyStr(n) + ', ' + f + '),'), ']', '',
      '',
      'def main():',
      '    ok = fail = 0',
      '    for name, fn in STEPS:',
      '        try:',
      '            response = fn()',
      '        except requests.RequestException as exc:',
      '            print(f"\\n=== {name} -> ERROR: {exc}")',
      '            response = None',
      '        if response is None or response.status_code >= 400:',
      '            fail += 1',
      '            if STOP_ON_ERROR:',
      '                print("Detenido por error (STOP_ON_ERROR = True)")',
      '                break',
      '        else:',
      '            ok += 1',
      '        if DELAY_SECONDS:',
      '            time.sleep(DELAY_SECONDS)',
      '    print(f"\\nResumen: {ok} ok · {fail} error(es)")',
      '    print("Variables finales:", json.dumps(VARS, indent=2, ensure_ascii=False))',
      '    return 1 if fail else 0',
      '',
      '',
      'if __name__ == "__main__":',
      '    sys.exit(main())');
    return L.join('\n') + '\n';
  }
  function slug(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'flujo'; }

  const API = { tokenize, parseCurl, curlToModel, modelToPython, curlToPython, isCurl, curlToStep, stepToModel, stepToPython, collectionToPython, slug };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Curl2Py = API;
})(typeof window !== 'undefined' ? window : globalThis);
