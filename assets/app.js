(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let curls = [], py = '';

  /* ─── Resaltado ─────────────────────────────────────────────────────── */
  const PY_KW = /^(import|from|def|return|for|in|if|else|elif|try|except|with|as|while|not|and|or|is|lambda|class|pass|raise)$/;
  function hlPy(src) {
    const re = /(#[^\n]*)|([fFrRbB]?"""[\s\S]*?"""|[fFrRbB]?"(?:\\.|[^"\\\n])*")|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;
    let out = '', last = 0, m, prevDef = false;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index)); last = re.lastIndex;
      const t = esc(m[0]);
      if (m[1]) out += `<i class="c">${t}</i>`;
      else if (m[2]) out += `<i class="s">${t.replace(/\{(\w+)\}/g, (x, n) => /^[A-Z_]+$/.test(n) ? `<i class="v">{${n}}</i>` : x)}</i>`;
      else if (m[3]) out += `<i class="n">${t}</i>`;
      else if (PY_KW.test(m[4])) { out += `<i class="k">${t}</i>`; prevDef = m[4] === 'def'; continue; }
      else if (/^(True|False|None)$/.test(m[4])) out += `<i class="n">${t}</i>`;
      else if (prevDef) out += `<i class="f">${t}</i>`;
      else if (/^[A-Z][A-Z0-9_]+$/.test(m[4])) out += `<i class="v">${t}</i>`;
      else out += t;
      prevDef = false;
    }
    return out + esc(src.slice(last));
  }
  function hlJson(src) {
    return esc(src).replace(/(&quot;(?:\\.|[^\\&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi,
      (m, s, colon, b, n) => s ? `<i class="${colon ? 'k' : 's'}">${s}</i>${colon || ''}` : `<i class="n">${b || n}</i>`);
  }

  /* ─── Estado → vista ─────────────────────────────────────────────────── */
  function render() {
    const n = curls.length;
    $('drop').hidden = !!n; $('list').hidden = !n; $('add').hidden = !n;
    $('count').hidden = !n; $('count').textContent = n + (n === 1 ? ' request' : ' requests');
    ['copy', 'download', 'run'].forEach(id => $(id).disabled = !n);
    $('clear').disabled = !n && $('resCard').hidden;

    $('list').innerHTML = curls.map((c, i) => {
      const r = Curl2Py.parseCurl(c); let host = '', path = r.url;
      try { const u = new URL(r.url); host = u.host; path = u.pathname + u.search; } catch (_) {}
      return `<li><span class="mb m-${esc(r.method)}">${esc(r.method)}</span>
        <span class="p"><b>${esc(path)}</b><small>${esc(host)}</small></span>
        <button class="x" data-i="${i}" aria-label="Quitar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></li>`;
    }).join('');

    py = n ? Curl2Py.curlsToPython(curls.join('\n')) : '';
    $('code').innerHTML = py
      ? `<pre class="ln">${py.replace(/\n$/, '').split('\n').map((_, i) => i + 1).join('\n')}</pre><pre class="src">${hlPy(py)}</pre>`
      : '<div class="code-empty"><svg viewBox="0 0 24 24"><path d="m8 7-5 5 5 5m8-10 5 5-5 5"/></svg></div>';
  }

  function addText(t) {
    t = String(t || '').trim();
    let found = Curl2Py.splitCurls(t);
    if (!found.length && /^\s*\{/.test(t)) found = harToCurls(t);
    if (!found.length) return false;
    curls.push(...found); render(); $('add').focus(); return true;
  }

  function harToCurls(text) {
    try {
      const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
      return (JSON.parse(text).log.entries || []).map(({ request: r }) => {
        const p = ['curl', q(r.url)];
        if (r.method !== 'GET') p.push('-X', r.method);
        (r.headers || []).filter(h => !h.name.startsWith(':') && !/^(content-length|host)$/i.test(h.name))
          .forEach(h => p.push('-H', q(h.name + ': ' + h.value)));
        if (r.postData && r.postData.text) p.push('--data-raw', q(r.postData.text));
        return p.join(' ');
      });
    } catch (_) { return []; }
  }

  function clearAll() {
    curls = []; $('add').value = ''; $('paste').value = ''; $('drop').classList.remove('typing'); $('results').innerHTML = ''; $('resCard').hidden = true; render();
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1400);
  }

  /* ─── Ejecutar ───────────────────────────────────────────────────────── */
  async function run() {
    if (!curls.length) return;
    const reqs = curls.map(Curl2Py.curlToWire);
    const btn = $('run'); btn.disabled = true; btn.classList.add('busy');
    $('resCard').hidden = false; $('resSum').textContent = '';
    $('results').innerHTML = reqs.map(() => '<div class="skel"></div>').join('');
    let data;
    try {
      const fd = new FormData(); fd.append('action', 'run'); fd.append('requests', JSON.stringify(reqs));
      data = await (await fetch(location.pathname, { method: 'POST', body: fd })).json();
    } catch (e) { data = reqs.map(() => ({ error: e.message })); }
    $('results').innerHTML = data.map((r, i) => resRow(r, reqs[i])).join('');
    const ok = data.filter(r => !r.error && r.status < 400).length;
    $('resSum').textContent = ok + '/' + data.length;
    btn.disabled = false; btn.classList.remove('busy'); render();
  }

  function resRow(r, q) {
    const s = r.error ? 0 : r.status;
    const cls = !s ? 'e5' : s >= 500 ? 'e5' : s >= 400 ? 'e4' : s >= 300 ? 'e3' : 'e2';
    let path = q.url;
    try { path = new URL(q.url).pathname; } catch (_) {}
    const body = r.error || String(r.body || '');
    const bodyHtml = r.is_json ? hlJson(body.slice(0, 50000)) : esc(body.slice(0, 50000));
    const hdrs = Object.entries(r.headers || {}).map(([k, v]) => `<i class="k">${esc(k)}</i>: ${esc(v)}`).join('\n');
    return `<details class="res"><summary>
        <span class="pill ${cls}">${r.error ? 'ERR' : s}</span>
        <span class="mb m-${esc(q.method)}">${esc(q.method)}</span>
        <span class="p"><b>${esc(path)}</b></span>
        <span class="muted">${r.error ? '' : r.time_ms + ' ms'}</span>
        <svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></summary>
      <div class="res-b"><div class="seg"><button class="on" data-t="b">Body</button><button data-t="h">Headers</button></div>
        <pre class="pane b">${bodyHtml || '<span class="muted">—</span>'}</pre><pre class="pane h" hidden>${hdrs}</pre></div></details>`;
  }

  /* ─── Eventos ────────────────────────────────────────────────────────── */
  $('list').addEventListener('click', e => {
    const x = e.target.closest('.x'); if (!x) return;
    curls.splice(+x.dataset.i, 1); render();
  });
  $('results').addEventListener('click', e => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const box = b.closest('.res-b');
    box.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
    box.querySelector('.b').hidden = b.dataset.t !== 'b'; box.querySelector('.h').hidden = b.dataset.t !== 'h';
  });
  $('add').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (addText(e.target.value)) e.target.value = ''; }
  });
  $('drop').addEventListener('click', () => $('paste').focus());
  $('paste').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && Curl2Py.splitCurls(e.target.value).length) { e.preventDefault(); if (addText(e.target.value)) e.target.value = ''; }
  });
  $('paste').addEventListener('input', e => $('drop').classList.toggle('typing', !!e.target.value));
  ['dragover', 'dragleave', 'drop'].forEach(t => document.addEventListener(t, async e => {
    e.preventDefault();
    document.body.classList.toggle('dragging', t === 'dragover');
    if (t !== 'drop') return;
    const f = e.dataTransfer.files[0];
    addText(f ? await f.text() : e.dataTransfer.getData('text'));
  }));
  document.addEventListener('paste', e => {
    const el = e.target, mine = el === $('paste') || el === $('add');
    if (!mine && el.closest && el.closest('input, textarea, [contenteditable]')) return;
    const t = (e.clipboardData || window.clipboardData).getData('text');
    if (addText(t)) { e.preventDefault(); if (mine) el.value = ''; $('drop').classList.remove('typing'); }
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l')) { e.preventDefault(); clearAll(); }
  });
  $('clear').onclick = clearAll;
  $('run').onclick = run;
  $('copy').onclick = () => navigator.clipboard.writeText(py).then(() => {
    const b = $('copy'); b.classList.add('done'); b.lastElementChild.textContent = 'Copiado';
    setTimeout(() => { b.classList.remove('done'); b.lastElementChild.textContent = 'Copiar'; }, 1400);
  }, () => toast('No se pudo copiar'));
  $('download').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([py], { type: 'text/x-python' }));
    a.download = 'automatizacion.py'; a.click(); URL.revokeObjectURL(a.href);
  };

  render();
  $('paste').focus();
})();
