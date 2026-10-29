(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('curls'), code = $('code'), results = $('results');
  const KEY = 'curl2py.input';

  function update() {
    localStorage.setItem(KEY, input.value);
    let py = '', n = 0;
    try { n = Curl2Py.splitCurls(input.value).length; py = Curl2Py.curlsToPython(input.value); }
    catch (e) { py = '# ' + e.message; }
    code.textContent = py;
    $('count').textContent = n ? n + (n === 1 ? ' request' : ' requests') : '';
    ['copy', 'download', 'run'].forEach(id => $(id).disabled = !n);
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1600);
  }

  async function run() {
    const reqs = Curl2Py.splitCurls(input.value).map(Curl2Py.curlToWire);
    if (!reqs.length) return;
    $('run').disabled = true; results.innerHTML = '<div class="row muted">…</div>';
    try {
      const fd = new FormData(); fd.append('action', 'run'); fd.append('requests', JSON.stringify(reqs));
      const data = await (await fetch(location.pathname, { method: 'POST', body: fd })).json();
      results.innerHTML = '';
      data.forEach((r, i) => results.appendChild(row(r, reqs[i])));
    } catch (e) { results.innerHTML = ''; results.appendChild(row({ error: e.message }, {})); }
    $('run').disabled = false;
  }

  function row(r, q) {
    const d = document.createElement('details');
    const s = document.createElement('summary');
    const st = r.error ? 'ERR' : r.status;
    const cls = r.error || r.status >= 400 ? 'err' : r.status >= 300 ? 'warn' : 'ok';
    s.innerHTML = `<span class="st ${cls}"></span><span class="m"></span><span class="u"></span><span class="t"></span>`;
    s.children[0].textContent = st;
    s.children[1].textContent = r.method || q.method || '';
    s.children[2].textContent = r.url || q.url || '';
    s.children[3].textContent = r.error ? '' : r.time_ms + ' ms';
    const pre = document.createElement('pre');
    pre.textContent = r.error || String(r.body || '').slice(0, 20000);
    d.append(s, pre);
    return d;
  }

  $('copy').onclick = () => navigator.clipboard.writeText(code.textContent).then(() => toast('Copiado'));
  $('download').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code.textContent], { type: 'text/x-python' }));
    a.download = 'automatizacion.py'; a.click(); URL.revokeObjectURL(a.href);
  };
  $('run').onclick = run;
  input.addEventListener('input', update);
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
  document.addEventListener('paste', e => {
    if (e.target === input) return;
    const t = e.clipboardData.getData('text');
    if (!Curl2Py.splitCurls(t).length) return;
    e.preventDefault();
    input.value = input.value.trim() ? input.value.trimEnd() + '\n\n' + t.trim() : t.trim();
    update();
  });

  input.value = localStorage.getItem(KEY) || '';
  update();
  input.focus();
})();
