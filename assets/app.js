/* ─── State ──────────────────────────────────────────────────────────────── */
const S = { cols: window.INIT_COLLECTIONS || [], id: null, si: 0, hc: 0 };
const col  = () => S.cols.find(c => c.id === S.id);
const step = () => col()?.steps?.[S.si];

/* ─── Cookie jar: { domain: { name: value } } ─────────────────────────────── */
// Persiste durante la sesión del navegador; se resetea al recargar la página.
const COOKIE_JAR = {};

/* ─── Search state ────────────────────────────────────────────────────────── */
const SRCH = { term: '', marks: [], idx: -1 };

/* ─── Editor de código ────────────────────────────────────────────────────── */
let CODE_DIRTY = false;
let LANG = 'py';                        // 'py' | 'php'
const codeKey = () => LANG === 'py' ? 'py_code' : 'php_code';

/* ─── Variables de ejecución (extraídas de respuestas) ────────────────────── */
const RUN_VARS = {};

/* ─── Boot ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  renderSidebar();
  if (S.cols.length) loadCol(S.cols[0].id);
  else newCol();
  lucide.createIcons();

  // Editor de código: Tab inserts spaces, input marks as dirty
  const phpEd = document.getElementById('codeTxt');
  phpEd.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = phpEd.selectionStart, end = phpEd.selectionEnd;
      phpEd.value = phpEd.value.slice(0, s) + '    ' + phpEd.value.slice(end);
      phpEd.selectionStart = phpEd.selectionEnd = s + 4;
    }
  });
  phpEd.addEventListener('input', () => {
    CODE_DIRTY = true;
    updateResetBtn();
  });
});

/* ─── Collections ────────────────────────────────────────────────────────── */
function newCol() {
  const id = 'col_' + Date.now();
  S.cols.unshift({ id, name: 'Nueva colección', steps: [mkStep('Paso 1')], env: [], saved_at: null });
  renderSidebar();
  loadCol(id);
}

function mkStep(name = 'Paso') {
  return {
    name, method: 'GET', url: '',
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    body: '', body_type: 'none', form_fields: [], php_code: null, py_code: null,
    timeout: 30, proxy: '', chain_extracts: [],
  };
}

function loadCol(id) {
  S.id = id; S.si = 0;
  const c = col(); if (!c) return;
  document.getElementById('colName').value = c.name || '';
  rebuildVars(c.env || []);
  renderStepTabs();
  loadStep(0);
  document.querySelectorAll('.col-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id));
  clearResponses();
}

function syncColName() {
  const c = col(); if (c) c.name = document.getElementById('colName').value;
  const el = document.querySelector(`.col-item[data-id="${S.id}"] .col-name`);
  if (el) el.textContent = c?.name || '';
}

async function saveCol() {
  flushStep();
  const c = col(); if (!c) return;
  const fd = new FormData();
  fd.append('action', 'save');
  fd.append('id', S.id || '');
  fd.append('data', JSON.stringify(c));
  const res  = await fetch('', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.ok) {
    S.id = data.id;
    const idx = S.cols.findIndex(x => x.id === S.id || x.id === data.id);
    if (idx >= 0) S.cols[idx] = data.col;
    renderSidebar();
    document.querySelectorAll('.col-item').forEach(el => el.classList.toggle('active', el.dataset.id === data.id));
    toast('Guardado', '#00d47e');
  }
}

async function deleteCol(id, e) {
  e.stopPropagation();
  if (!confirm('¿Eliminar esta colección?')) return;
  const fd = new FormData(); fd.append('action', 'delete'); fd.append('id', id);
  await fetch('', { method: 'POST', body: fd });
  S.cols = S.cols.filter(c => c.id !== id);
  renderSidebar();
  if (S.id === id) { if (S.cols.length) loadCol(S.cols[0].id); else newCol(); }
  toast('Eliminada', '#ff453a');
}

function renderSidebar() {
  const list = document.getElementById('sbList');
  if (!S.cols.length) {
    list.innerHTML = `<div class="sb-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:.15;margin-bottom:8px"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
      <p>Sin colecciones.<br>Crea una nueva.</p>
    </div>`;
    return;
  }
  list.innerHTML = S.cols.map((c, delay) => `
    <div class="col-item${c.id === S.id ? ' active' : ''}" data-id="${c.id}" onclick="loadCol('${c.id}')"
         style="animation-delay:${delay * 30}ms">
      <div class="col-name">${esc(c.name || 'Sin nombre')}</div>
      <div class="col-meta">
        <span>${(c.steps || []).length} paso${(c.steps||[]).length !== 1 ? 's' : ''}</span>
        ${c.saved_at ? `<span>· ${c.saved_at.slice(0,10)}</span>` : '<span style="color:rgba(255,255,255,.15)">· no guardado</span>'}
      </div>
      <button class="col-del" onclick="deleteCol('${c.id}',event)" title="Eliminar">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`).join('');
}

/* ─── Steps ──────────────────────────────────────────────────────────────── */
function addStep() {
  flushStep();
  const c = col(); if (!c) return;
  c.steps = c.steps || [];
  c.steps.push(mkStep(`Paso ${c.steps.length + 1}`));
  renderSidebar();
  renderStepTabs();
  loadStep(c.steps.length - 1);
}

function removeStep(i, e) {
  e.stopPropagation();
  const c = col();
  if (!c || (c.steps || []).length <= 1) { toast('Mínimo 1 paso', '#f5a623'); return; }
  c.steps.splice(i, 1);
  renderSidebar();
  renderStepTabs();
  loadStep(Math.min(S.si, c.steps.length - 1));
}

function switchStep(i) { flushStep(); loadStep(i); }

function renderStepTabs() {
  const c = col(); if (!c) return;
  const row = document.getElementById('stepTabsRow');
  row.innerHTML = (c.steps || []).map((s, i) => `
    <div class="step-tab${i === S.si ? ' active' : ''}" onclick="switchStep(${i})">
      <span class="step-m m-${s.method || 'GET'}">${s.method || 'GET'}</span>
      ${esc(s.name || `Paso ${i + 1}`)}
      <span class="tab-x" onclick="removeStep(${i},event)" title="Eliminar paso">×</span>
    </div>`).join('') +
    `<button class="btn-add-step" onclick="addStep()">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Paso
    </button>`;
}

function loadStep(i) {
  S.si = i;
  const s = step(); if (!s) return;
  document.getElementById('stepName').value = s.name || '';
  document.getElementById('msel').value     = s.method || 'GET';
  document.getElementById('urlIn').value    = s.url || '';
  document.getElementById('stepTimeout').value = s.timeout ?? 30;
  document.getElementById('stepProxy').value   = s.proxy ?? '';
  const bt = s.body_type || 'none';
  applyBodyType(bt);
  if (bt === 'json')   document.getElementById('bodyTa').value     = s.body || '';
  if (bt === 'urlenc') document.getElementById('bodyUrlenc').value = s.body || '';
  if (bt === 'raw')    document.getElementById('bodyRaw').value    = s.body || '';
  if (bt === 'form')   rebuildFormFields(s.form_fields || []);
  rebuildHeaders(s.headers || []);
  rebuildChainExtracts(s.chain_extracts || []);
  renderStepTabs();
  loadCode();
}

function loadCode() {
  const s = step(); if (!s) return;
  CODE_DIRTY = !!s[codeKey()];
  if (CODE_DIRTY) document.getElementById('codeTxt').value = s[codeKey()];
  else updateCode();
  updateResetBtn();
}

function flushStep() {
  const s = step(); if (!s) return;
  s.name      = document.getElementById('stepName').value;
  s.method    = document.getElementById('msel').value;
  s.url       = document.getElementById('urlIn').value;
  s.timeout   = parseInt(document.getElementById('stepTimeout')?.value) || 30;
  s.proxy     = document.getElementById('stepProxy')?.value?.trim() || '';
  s.headers   = getHeaders();
  s.body_type = currentBodyType();
  const bt    = s.body_type;
  s.body      = bt === 'json'   ? document.getElementById('bodyTa').value
              : bt === 'urlenc' ? document.getElementById('bodyUrlenc').value
              : bt === 'raw'    ? document.getElementById('bodyRaw').value
              : '';
  s.form_fields    = bt === 'form' ? getFormFields() : [];
  s[codeKey()]     = CODE_DIRTY ? document.getElementById('codeTxt').value : null;
  s.chain_extracts = getChainExtracts();
}

function syncField() {
  const s = step(); if (!s) return;
  s.name    = document.getElementById('stepName').value;
  s.method  = document.getElementById('msel').value;
  s.url     = document.getElementById('urlIn').value;
  s.timeout = parseInt(document.getElementById('stepTimeout')?.value) || 30;
  s.proxy   = document.getElementById('stepProxy')?.value?.trim() || '';
  s.body_type = currentBodyType();
  const bt = s.body_type;
  s.body  = bt === 'json' ? document.getElementById('bodyTa').value
          : bt === 'urlenc' ? document.getElementById('bodyUrlenc').value
          : bt === 'raw' ? document.getElementById('bodyRaw').value : '';
  renderStepTabs();
}

/* ─── Headers ────────────────────────────────────────────────────────────── */
function addHeader(k = '', v = '') {
  const list = document.getElementById('hList');
  const row  = document.createElement('div');
  row.className = 'h-row';
  row.innerHTML = `
    <input type="text" placeholder="Header" value="${esc(k)}" oninput="flushHeaders();updateCode()">
    <input type="text" placeholder="Valor"  value="${esc(v)}" oninput="flushHeaders();updateCode()">
    <button class="btn-x" onclick="this.closest('.h-row').remove();flushHeaders();updateCode()" title="Eliminar">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  list.appendChild(row);
  if (!k) row.querySelector('input').focus();
}
function rebuildHeaders(arr) {
  document.getElementById('hList').innerHTML = '';
  arr.forEach(h => addHeader(h.key || '', h.value || ''));
  if (!arr.length) addHeader('Content-Type', 'application/json');
}
function getHeaders() {
  return [...document.querySelectorAll('.h-row')].map(r => {
    const ins = r.querySelectorAll('input');
    return { key: ins[0].value.trim(), value: ins[1].value.trim() };
  }).filter(h => h.key);
}
function flushHeaders() { const s = step(); if (s) s.headers = getHeaders(); }

/* ─── Body type ──────────────────────────────────────────────────────────── */
function currentBodyType() {
  const a = document.querySelector('.btype-btn.active');
  return a ? a.dataset.bt : 'none';
}
function applyBodyType(bt) {
  document.querySelectorAll('.btype-btn').forEach(b => b.classList.toggle('active', b.dataset.bt === bt));
  document.querySelectorAll('.bpanel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('bp-' + bt);
  if (panel) panel.classList.add('active');
}
function setBodyType(el, bt) { applyBodyType(bt); syncField(); updateCode(); }

/* ─── Form Data ──────────────────────────────────────────────────────────── */
function addFormField(k = '', v = '') {
  const list = document.getElementById('fdList');
  const row  = document.createElement('div');
  row.className = 'fd-row';
  row.innerHTML = `
    <input type="text" placeholder="nombre_campo" value="${esc(k)}" oninput="flushFormFields()">
    <input type="text" placeholder="valor"         value="${esc(v)}" oninput="flushFormFields()">
    <button class="btn-x" onclick="this.closest('.fd-row').remove();flushFormFields()" title="Eliminar">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  list.appendChild(row);
  if (!k) row.querySelector('input').focus();
  updateFdCount();
}
function getFormFields() {
  return [...document.querySelectorAll('.fd-row')].map(r => {
    const ins = r.querySelectorAll('input');
    return { key: ins[0].value, value: ins[1].value };
  }).filter(f => f.key.trim());
}
function flushFormFields() {
  const s = step(); if (s) s.form_fields = getFormFields();
  updateFdCount();
}
function rebuildFormFields(arr) {
  document.getElementById('fdList').innerHTML = '';
  arr.forEach(f => addFormField(f.key || '', f.value || ''));
  updateFdCount();
}
function updateFdCount() {
  const n = document.querySelectorAll('.fd-row').length;
  const el = document.getElementById('fdCount');
  if (el) el.textContent = n + ' campo' + (n !== 1 ? 's' : '');
}

/* ─── Tabs ───────────────────────────────────────────────────────────────── */
function switchRTab(el, id) {
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.rpanel').forEach(p => { p.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  if (id === 'rCode') updateCode();
}

/* ─── Execute ────────────────────────────────────────────────────────────── */
async function runStep() {
  flushStep();
  const s = step(); if (!s) return;
  if (!s.url) { toast('Ingresa una URL', '#f5a623'); return; }
  const btn = document.getElementById('btnRun');
  btn.classList.add('loading');
  const result = await execStep(withVars(s));
  btn.classList.remove('loading');
  collectVars(s, result);
  clearResponses();
  appendRespItem(s.name || `Paso ${S.si + 1}`, result, true);
}

async function execStep(s) {
  const fd = new FormData();
  fd.append('action',       'execute');
  fd.append('url',          s.url);
  fd.append('method',       s.method || 'GET');
  fd.append('headers_json', JSON.stringify(s.headers || []));
  fd.append('body_type',    s.body_type || 'none');
  fd.append('timeout',      s.timeout ?? 30);
  fd.append('proxy',        s.proxy ?? '');
  fd.append('cookie_jar',   JSON.stringify(COOKIE_JAR));
  fd.append('insecure',     s.insecure ? '1' : '');
  if ((s.body_type || 'none') === 'form') {
    fd.append('form_fields_json', JSON.stringify(s.form_fields || []));
  } else {
    fd.append('body', s.body || '');
  }
  try {
    const res  = await fetch('', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.cookie_jar) mergeCookieJar(data.cookie_jar);
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

/* ─── Response ───────────────────────────────────────────────────────────── */

async function runAll() {
  flushStep();
  const c = col(); if (!c || !c.steps?.length) return;
  const btn = document.getElementById('btnAll');
  btn.querySelector('.run-all-label').textContent = 'Ejecutando…';
  btn.disabled = true;
  clearResponses();

  // Usar el endpoint execute_all que comparte el jar server-side entre pasos
  const fd = new FormData();
  fd.append('action',     'execute_all');
  fd.append('steps_json', JSON.stringify(c.steps));
  fd.append('cookie_jar', JSON.stringify(COOKIE_JAR));
  fd.append('vars_json',  JSON.stringify(currentVars()));
  fd.append('timeout',    c.steps[0]?.timeout ?? 30);
  fd.append('proxy',      c.steps[0]?.proxy ?? '');

  let ok = 0, fail = 0;
  try {
    const res  = await fetch('', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.cookie_jar) mergeCookieJar(data.cookie_jar);
    if (data.vars) Object.assign(RUN_VARS, data.vars);
    for (const [i, r] of (data.results || []).entries()) {
      const name = c.steps[r.step ?? i]?.name || `Paso ${i + 1}`;
      appendRespItem(name, r, i === 0);
      if (r.error || r.status >= 400) fail++; else ok++;
    }
  } catch (e) {
    appendRespItem('Error', { error: e.message }, true);
    fail++;
  }

  btn.querySelector('.run-all-label').textContent = 'Ejecutar todo';
  btn.disabled = false;
  document.getElementById('runBadge').textContent = `${ok} ok · ${fail} err`;
  if (Object.keys(COOKIE_JAR).length) renderCookieBadge();
}

/* ── Cookie jar helpers ────────────────────────────────────────────────────── */
function mergeCookieJar(incoming) {
  for (const [domain, cookies] of Object.entries(incoming)) {
    if (!COOKIE_JAR[domain]) COOKIE_JAR[domain] = {};
    Object.assign(COOKIE_JAR[domain], cookies);
  }
  renderCookieBadge();
}

function renderCookieBadge() {
  const total = Object.values(COOKIE_JAR).reduce((n, d) => n + Object.keys(d).length, 0);
  let badge = document.getElementById('cookieBadge');
  if (!badge) return;
  if (total === 0) { badge.textContent = ''; badge.title = ''; return; }
  badge.textContent = `🍪 ${total}`;
  const lines = Object.entries(COOKIE_JAR).map(([d, cs]) =>
    `${d}: ${Object.keys(cs).join(', ')}`);
  badge.title = lines.join('\n');
}

function clearCookieJar() {
  for (const k of Object.keys(COOKIE_JAR)) delete COOKIE_JAR[k];
  renderCookieBadge();
  toast('Cookie jar vaciado', '#f5a623');
}
function clearResponses() {
  document.getElementById('respScroll').innerHTML = '';
  document.getElementById('runBadge').textContent = '';
  clearSearch();
}

function appendRespItem(name, data, expanded = true) {
  const scroll = document.getElementById('respScroll');
  const div    = document.createElement('div');
  div.className = 'resp-item' + (expanded ? ' open' : '');

  let statusHtml = '', content = '';
  if (data.error) {
    statusHtml = `<span class="sbadge serr">ERR</span>`;
    content = buildRespContent(null, null, `<span style="color:var(--err)">${esc(data.error)}</span>`, null);
  } else {
    const sc = data.status;
    const scCls = sc >= 500 ? 's5xx' : sc >= 400 ? 's4xx' : sc >= 300 ? 's3xx' : 's2xx';
    const size  = data.size ? fmtBytes(data.size) : '';
    statusHtml = `
      <span class="sbadge ${scCls}">${sc}</span>
      <span class="tms">${data.time_ms}ms${size ? ' · ' + size : ''}</span>`;
    content = buildRespContent(data.is_json ? synJson(data.body) : esc(data.body), data.headers, null, data.body);
  }

  div.innerHTML = `
    <div class="resp-item-hdr" onclick="this.closest('.resp-item').classList.toggle('open')">
      <span class="resp-arrow">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </span>
      <span class="resp-step-name">${esc(name)}</span>
      ${statusHtml}
    </div>
    <div class="resp-item-body">${content}</div>`;
  scroll.appendChild(div);

  // Re-apply search if active
  if (SRCH.term) setTimeout(() => doSearch(SRCH.term), 50);
}

function buildRespContent(bodyHtml, headers, errHtml, rawBody) {
  const uid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  if (errHtml) return `<div class="jbox" style="margin:10px">${errHtml}</div>`;
  const headersHtml = headers
    ? Object.entries(headers).map(([k,v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
    : '';
  return `
    <div class="rb-tabs">
      <div class="rb-tab active" onclick="rbTab(this,'${uid}b')">Body</div>
      <div class="rb-tab" onclick="rbTab(this,'${uid}h')">Headers</div>
      <div class="rb-tab" onclick="rbTab(this,'${uid}r')">Raw</div>
    </div>
    <div class="rb-pane active" id="${uid}b"><div class="jbox">${bodyHtml || ''}</div></div>
    <div class="rb-pane" id="${uid}h">
      <table class="htable"><thead><tr><th>Header</th><th>Valor</th></tr></thead><tbody>${headersHtml}</tbody></table>
    </div>
    <div class="rb-pane" id="${uid}r"><div class="jbox">${esc(rawBody || '')}</div></div>`;
}

function rbTab(el, id) {
  const body = el.closest('.resp-item-body');
  body.querySelectorAll('.rb-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  body.querySelectorAll('.rb-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function fmtBytes(b) {
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b/1024).toFixed(1) + 'KB';
  return (b/1048576).toFixed(1) + 'MB';
}

/* ─── Response search ────────────────────────────────────────────────────── */
let searchDebounce;
function onSearch(val) {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => doSearch(val), 160);
}

function doSearch(term) {
  // Clear old marks
  document.querySelectorAll('mark.sh').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
  SRCH.marks = []; SRCH.idx = -1; SRCH.term = term.trim().toLowerCase();
  document.getElementById('searchCount').textContent = '';

  if (!SRCH.term) return;

  const scroll = document.getElementById('respScroll');
  // Only search inside .jbox elements (body displays)
  const walker = document.createTreeWalker(scroll, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      // Skip if inside a mark already
      if (n.parentElement.tagName === 'MARK') return NodeFilter.FILTER_REJECT;
      return n.nodeValue.toLowerCase().includes(SRCH.term) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const text = node.nodeValue;
    const ltext = text.toLowerCase();
    const frags = [];
    let last = 0, pos;
    const tl = SRCH.term.length;
    while ((pos = ltext.indexOf(SRCH.term, last)) !== -1) {
      if (pos > last) frags.push(document.createTextNode(text.slice(last, pos)));
      const mark = document.createElement('mark');
      mark.className = 'sh';
      mark.textContent = text.slice(pos, pos + tl);
      frags.push(mark);
      SRCH.marks.push(mark);
      last = pos + tl;
    }
    if (last < text.length) frags.push(document.createTextNode(text.slice(last)));
    if (frags.length) node.replaceWith(...frags);
  }

  const count = SRCH.marks.length;
  document.getElementById('searchCount').textContent = count ? `${count} resultado${count !== 1 ? 's' : ''}` : '0';

  if (count) { SRCH.idx = 0; focusMark(0); }
}

function focusMark(i) {
  SRCH.marks.forEach((m, j) => m.classList.toggle('current', j === i));
  SRCH.marks[i]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const count = SRCH.marks.length;
  document.getElementById('searchCount').textContent = `${i + 1}/${count}`;
}

function searchNext() {
  if (!SRCH.marks.length) return;
  SRCH.idx = (SRCH.idx + 1) % SRCH.marks.length;
  focusMark(SRCH.idx);
}
function searchPrev() {
  if (!SRCH.marks.length) return;
  SRCH.idx = (SRCH.idx - 1 + SRCH.marks.length) % SRCH.marks.length;
  focusMark(SRCH.idx);
}
function clearSearch() {
  document.querySelectorAll('mark.sh').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
  SRCH.marks = []; SRCH.idx = -1; SRCH.term = '';
  const inp = document.getElementById('searchIn');
  if (inp) inp.value = '';
  document.getElementById('searchCount').textContent = '';
}

/* ─── Código (Python / PHP) ───────────────────────────────────────────────────────────── */
function updateCode() {
  if (CODE_DIRTY) return;
  document.getElementById('codeTxt').value = LANG === 'py' ? pyCode() : phpCode();
}

function snapshotStep() {
  const bt = currentBodyType();
  return { ...step(), method: document.getElementById('msel').value, url: document.getElementById('urlIn').value,
    headers: getHeaders(), body_type: bt, form_fields: bt === 'form' ? getFormFields() : [],
    body: bt === 'json' ? document.getElementById('bodyTa').value
        : bt === 'urlenc' ? document.getElementById('bodyUrlenc').value
        : bt === 'raw' ? document.getElementById('bodyRaw').value : '' };
}

function pyCode() {
  const s = snapshotStep();
  return s.url.trim() ? Curl2Py.stepToPython(s) : '';
}

function setLang(lang) {
  const s = step();
  if (s && CODE_DIRTY) s[codeKey()] = document.getElementById('codeTxt').value;
  LANG = lang;
  document.querySelectorAll('#langSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  loadCode();
}

function phpCode() {
  const url  = document.getElementById('urlIn').value.trim();
  const m    = document.getElementById('msel').value;
  const hdrs = getHeaders();
  const bt   = currentBodyType();
  if (!url) return '';

  const hArr = hdrs.map(h => `    '${escPhp(h.key)}: ${escPhp(h.value)}',`).join('\n');
  const lines = [
    '<?php',
    '$ch = curl_init();',
    `curl_setopt($ch, CURLOPT_URL, '${escPhp(url)}');`,
    'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);',
    'curl_setopt($ch, CURLOPT_TIMEOUT, 30);',
    'curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);',
  ];
  if (hdrs.length) lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [\n${hArr}\n]);`);

  const methods = ['POST','PUT','PATCH','DELETE'];
  if (methods.includes(m)) {
    if (m === 'POST') lines.push('curl_setopt($ch, CURLOPT_POST, true);');
    else              lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${m}');`);
    if (bt === 'form') {
      const ff = getFormFields();
      if (ff.length) {
        const arr = ff.map(f => `    '${escPhp(f.key)}' => '${escPhp(f.value)}',`).join('\n');
        lines.push(`// multipart/form-data\ncurl_setopt($ch, CURLOPT_POSTFIELDS, [\n${arr}\n]);`);
      }
    } else if (bt === 'urlenc') {
      const raw = document.getElementById('bodyUrlenc').value.trim();
      if (raw) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${escPhp(raw)}');`);
    } else if (bt === 'json') {
      const raw = document.getElementById('bodyTa').value.trim();
      if (raw) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${escPhp(raw)}');`);
    } else if (bt === 'raw') {
      const raw = document.getElementById('bodyRaw').value.trim();
      if (raw) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${escPhp(raw)}');`);
    }
  }
  lines.push('', '$response  = curl_exec($ch);', '$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);', 'curl_close($ch);', '', "echo 'HTTP ' . \$http_code . PHP_EOL . \$response;");
  return lines.join('\n');
}

function cpCode() {
  const code = document.getElementById('codeTxt').value;
  if (!code.trim()) { toast('Sin código', '#f5a623'); return; }
  navigator.clipboard.writeText(code).then(() => toast('Copiado', '#00d47e'));
}

function resetCode() {
  CODE_DIRTY = false;
  const s = step(); if (s) s[codeKey()] = null;
  updateCode();
  updateResetBtn();
}

function updateResetBtn() {
  const btn = document.getElementById('btnResetCode');
  if (btn) btn.style.opacity = CODE_DIRTY ? '1' : '.35';
}

function escPhp(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function generateStepCode(s, idx) {
  const url  = (s.url || '').trim();
  const m    = (s.method || 'GET').toUpperCase();
  const hdrs = (s.headers || []).filter(h => h.key);
  const bt   = s.body_type || 'none';
  if (!url) return `    // Paso ${idx}: URL vacía`;
  const varR = '$resp' + idx, varC = '$code' + idx;
  const hArr = hdrs.map(h => `    '${escPhp(h.key)}: ${escPhp(h.value)}',`).join('\n');
  const lines = [
    `$ch = curl_init();`,
    `curl_setopt($ch, CURLOPT_URL, '${escPhp(url)}');`,
    `curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);`,
    `curl_setopt($ch, CURLOPT_TIMEOUT, 30);`,
    `curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);`,
  ];
  if (hdrs.length) lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [\n${hArr}\n]);`);
  if (['POST','PUT','PATCH','DELETE'].includes(m)) {
    lines.push(m === 'POST' ? `curl_setopt($ch, CURLOPT_POST, true);` : `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${m}');`);
    if (bt === 'form' && (s.form_fields || []).some(f => f.key)) {
      const arr = s.form_fields.filter(f => f.key).map(f => `    '${escPhp(f.key)}' => '${escPhp(f.value)}',`).join('\n');
      lines.push(`// multipart/form-data\ncurl_setopt($ch, CURLOPT_POSTFIELDS, [\n${arr}\n]);`);
    } else if (s.body && bt !== 'none') {
      lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${escPhp(s.body)}');`);
    }
  }
  lines.push(
    `${varR}  = curl_exec($ch);`,
    `${varC} = curl_getinfo($ch, CURLINFO_HTTP_CODE);`,
    `curl_close($ch);`,
    `echo 'HTTP ' . ${varC} . PHP_EOL . ${varR} . PHP_EOL;`
  );
  return lines.join('\n');
}

function combinedPhp(c) {
  const sep = '─'.repeat(60);
  const lines = [
    '<?php',
    `// Colección: ${c.name || 'Sin nombre'}`,
    `// Generado por API Builder — ${new Date().toISOString().slice(0, 10)}`,
    ''
  ];
  c.steps.forEach((s, i) => {
    const num  = i + 1;
    const name = s.name || `Paso ${num}`;
    lines.push(`// ${sep}`);
    lines.push(`// Paso ${num}: ${name}`);
    lines.push(`// ${sep}`);
    lines.push(`echo "\\n=== ${name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')} ===\\n";`);
    lines.push('');
    if (s.php_code) {
      lines.push(s.php_code.replace(/^<\?php\s*/i, '').trim());
    } else {
      lines.push(generateStepCode(s, num));
    }
    lines.push('');
  });
  return lines.join('\n');
}

function generateFlow() {
  flushStep();
  const c = col();
  if (!c || !c.steps?.length) { toast('Sin pasos', '#f5a623'); return; }
  document.getElementById('codeTxt').value = LANG === 'py' ? Curl2Py.collectionToPython(c) : combinedPhp(c);
  CODE_DIRTY = true;
  updateResetBtn();
  showCodeTab();
  toast(`Flujo · ${c.steps.length} paso${c.steps.length !== 1 ? 's' : ''}`, '#00d47e');
}

function showCodeTab() {
  const tab = [...document.querySelectorAll('.rtab')].find(t => t.getAttribute('onclick')?.includes("'rCode'"));
  if (tab) switchRTab(tab, 'rCode');
}

function downloadCode() {
  const code = document.getElementById('codeTxt').value;
  if (!code.trim()) { toast('Sin código', '#f5a623'); return; }
  const name = Curl2Py.slug(col()?.name || 'script') + (LANG === 'py' ? '.py' : '.php');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([code], { type: 'text/plain' })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ─── JSON syntax ────────────────────────────────────────────────────────── */
function synJson(json) {
  return esc(json)
    .replace(/"((?:\\.|[^"\\])*)"\s*:/g, '<span class="jk">"$1"</span>:')
    .replace(/:\s*"((?:\\.|[^"\\])*)"/g, ': <span class="js">"$1"</span>')
    .replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, ': <span class="jn">$1</span>')
    .replace(/:\s*(true|false)\b/g, ': <span class="jb">$1</span>')
    .replace(/:\s*(null)\b/g, ': <span class="jnu">null</span>');
}

/* ─── DevTools Import ────────────────────────────────────────────────────── */
let IMP_MODE = 'curl';
function openImport() {
  document.getElementById('importOverlay').classList.add('open');
  document.getElementById('rawHeadersTa').focus();
}
function setImpMode(mode) {
  IMP_MODE = mode;
  document.querySelectorAll('#impSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.imp === mode));
  document.getElementById('impDevtoolsOpts').style.display = mode === 'devtools' ? 'flex' : 'none';
  document.getElementById('rawHeadersTa').placeholder = mode === 'curl' ? "curl 'https://…' -H '…'" : 'Request URL: https://…';
}
function closeImport() { document.getElementById('importOverlay').classList.remove('open'); }

function doImport() {
  const raw = document.getElementById('rawHeadersTa').value.trim();
  if (!raw) { toast('Pega algo primero', '#f5a623'); return; }
  if (IMP_MODE === 'curl' || Curl2Py.isCurl(raw)) {
    if (!Curl2Py.isCurl(raw)) { toast('No parece un cURL', '#ff453a'); return; }
    importCurl(raw, document.getElementById('optNewStep').checked);
    document.getElementById('rawHeadersTa').value = '';
    closeImport();
    return;
  }
  importDevtools(raw);
}

/* cURL → paso actual (o nuevo) y muestra el código Python */
function importCurl(raw, asNewStep = false) {
  const c = col(); if (!c) return;
  let imported;
  try { imported = Curl2Py.curlToStep(raw); } catch (e) { toast('cURL inválido', '#ff453a'); return; }
  if (!imported.url) { toast('cURL sin URL', '#ff453a'); return; }
  flushStep();
  if (asNewStep) { c.steps.push(imported); S.si = c.steps.length - 1; renderSidebar(); }
  else {
    const cur = step();
    c.steps[S.si] = { ...imported, chain_extracts: cur?.chain_extracts || [] };
  }
  loadStep(S.si);
  setLang('py');
  showCodeTab();
  toast(`cURL → Python · ${imported.method}`, '#00d47e');
}

function importDevtools(raw) {
  const rawBody = document.getElementById('rawBodyTa').value.trim();
  const opts = {
    accept:  document.getElementById('optAccept').checked,
    cookie:  document.getElementById('optCookie').checked,
    origin:  document.getElementById('optOrigin').checked,
    referer: document.getElementById('optReferer').checked,
    ua:      document.getElementById('optUA').checked,
    lang:    document.getElementById('optLang').checked,
  };
  const SKIP = new Set(['alt-svc','cf-cache-status','cf-ray','cf-connecting-ip','date','expires','nel','pragma','report-to','server','server-timing','strict-transport-security','x-content-type-options','x-frame-options','x-powered-by','x-xss-protection','x-ac','x-hacker','x-robots-tag','host-header','link','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers','access-control-expose-headers','cross-origin-opener-policy','cross-origin-resource-policy','vary','etag','last-modified','age','transfer-encoding','content-encoding','content-security-policy','accept-encoding','priority','upgrade-insecure-requests','cache-control','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform','sec-ch-ua-arch','sec-ch-ua-full-version','sec-ch-ua-full-version-list','sec-ch-ua-bitness','sec-fetch-dest','sec-fetch-mode','sec-fetch-site','sec-fetch-user','content-length']);
  if (!opts.accept)  SKIP.add('accept');
  if (!opts.cookie)  SKIP.add('cookie');
  if (!opts.origin)  SKIP.add('origin');
  if (!opts.referer) SKIP.add('referer');
  if (!opts.ua)      SKIP.add('user-agent');
  if (!opts.lang)    SKIP.add('accept-language');

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) { toast('Pega los headers primero', '#f5a623'); return; }

  let url = '', method = 'GET', headers = [];
  const isFormatB = lines.some(l => /^Request URL\s*$/.test(l) || /^Request Method\s*$/.test(l));

  if (isFormatB) {
    let i = 0;
    while (i < lines.length) {
      const key = lines[i], val = (i + 1 < lines.length) ? lines[i + 1] : '';
      if (/^Request URL$/i.test(key))                                  { url = val; i += 2; continue; }
      if (/^Request Method$/i.test(key))                               { method = val.toUpperCase(); i += 2; continue; }
      if (/^(Status Code|Remote Address|Referrer Policy)$/i.test(key)) { i += 2; continue; }
      if (key.startsWith(':'))                                          { i += 2; continue; }
      if (/^[a-zA-Z][a-zA-Z0-9\-]*$/.test(key)) {
        const kl = key.toLowerCase();
        const isRespCT = kl === 'content-type' && /^text\/html|text\/css|text\/xml|image\//.test(val);
        if (!SKIP.has(kl) && !isRespCT) headers.push({ key, value: val });
        i += 2;
      } else { i++; }
    }
  } else {
    let inResp = false;
    for (const line of lines) {
      if (/^Request Headers/i.test(line))  { inResp = false; continue; }
      if (/^Response Headers/i.test(line)) { inResp = true;  continue; }
      if (/^General$/i.test(line))         { inResp = false; continue; }
      if (/^Request URL:\s*/i.test(line))  { url = line.replace(/^Request URL:\s*/i, '').trim(); continue; }
      if (/^Request Method:\s*/i.test(line)) { method = line.replace(/^Request Method:\s*/i, '').trim().toUpperCase(); continue; }
      if (/^(Status Code|Remote Address|Referrer Policy):/i.test(line)) continue;
      if (line.startsWith(':') || inResp) continue;
      const ci = line.indexOf(': ');
      if (ci > 0) {
        const k = line.substring(0, ci).trim(), v = line.substring(ci + 2).trim();
        if (/^[a-zA-Z][a-zA-Z0-9\-]*$/.test(k) && !SKIP.has(k.toLowerCase())) headers.push({ key: k, value: v });
      }
    }
  }

  if (!url && !headers.length) { toast('No se encontró nada. Copia el bloque completo de Headers.', '#f5a623'); return; }

  const s = step(); if (!s) return;
  if (url)    { s.url = url;       document.getElementById('urlIn').value = url; }
  if (method) { s.method = method; document.getElementById('msel').value = method; }
  s.headers = headers;
  rebuildHeaders(headers.length ? headers : [{ key: 'Content-Type', value: 'application/json' }]);
  if (rawBody) { s.body = rawBody; document.getElementById('bodyTa').value = rawBody; applyBodyType('json'); s.body_type = 'json'; }
  syncField(); updateCode(); closeImport();
  document.getElementById('rawHeadersTa').value = '';
  document.getElementById('rawBodyTa').value = '';
  toast(`Importado · ${method} · ${headers.length} headers`, '#00d47e');
}

/* ─── Multipart parser ───────────────────────────────────────────────────── */
function openMultipartModal() {
  document.getElementById('mpOverlay').classList.add('open');
  document.getElementById('mpRaw').focus();
}
function closeMpModal() { document.getElementById('mpOverlay').classList.remove('open'); }

function doParseMultipart() {
  const raw    = document.getElementById('mpRaw').value;
  const fields = parseMultipart(raw);
  if (!fields.length) { toast('No se encontraron campos.', '#f5a623'); return; }
  rebuildFormFields(fields);
  flushFormFields();
  applyBodyType('form'); syncField(); updateCode();
  closeMpModal();
  document.getElementById('mpRaw').value = '';
  toast(`${fields.length} campos importados`, '#00d47e');
}

function parseMultipart(raw) {
  const fields = [];
  const parts  = raw.split(/\r?\n-{4,}[^\r\n]*/);
  for (const part of parts) {
    const lines = part.split(/\r?\n/);
    let name = null, pastHeader = false;
    const valueLines = [];
    for (const line of lines) {
      if (!pastHeader) {
        const m = line.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"/i);
        if (m) name = m[1];
        if (line.trim() === '' && name !== null) pastHeader = true;
      } else {
        if (line.trim() === '--') break;
        valueLines.push(line);
      }
    }
    if (name !== null) {
      while (valueLines.length && valueLines[valueLines.length - 1].trim() === '') valueLines.pop();
      const value = valueLines.join('\n').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      fields.push({ key: name, value });
    }
  }
  return fields;
}

/* ─── Chain Extracts (response → variable) ────────────────────────────────── */
function addChainExtract(varName = '', path = '') {
  const list = document.getElementById('chainList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'chain-row';
  row.innerHTML = `
    <span class="chain-pill">{{</span>
    <input type="text" class="chain-var" placeholder="NOMBRE_VAR" value="${esc(varName)}" oninput="flushChain()" title="Nombre de variable. Úsala en pasos siguientes como {{NOMBRE_VAR}}">
    <span class="chain-pill">}}</span>
    <span class="chain-sep">←</span>
    <input type="text" class="chain-path" placeholder="data.token" value="${esc(path)}" oninput="flushChain()" title="data.token · header:X-Token · cookie:sid · regex:(…)">
    <button class="btn-x" onclick="this.closest('.chain-row').remove();flushChain()" title="Eliminar">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  list.appendChild(row);
  if (!varName) row.querySelector('.chain-var').focus();
}
function getChainExtracts() {
  return [...document.querySelectorAll('.chain-row')].map(r => ({
    var:  r.querySelector('.chain-var')?.value?.trim()  || '',
    path: r.querySelector('.chain-path')?.value?.trim() || '',
  })).filter(e => e.var && e.path);
}
function flushChain() { const s = step(); if (s) s.chain_extracts = getChainExtracts(); }
function rebuildChainExtracts(arr) {
  const list = document.getElementById('chainList');
  if (!list) return;
  list.innerHTML = '';
  (arr || []).forEach(e => addChainExtract(e.var, e.path));
}

/* ─── Variables de colección ({{VAR}}) ───────────────────────────────────── */
function addVar(k = '', v = '') {
  const row = document.createElement('div');
  row.className = 'h-row var-row';
  row.innerHTML = `
    <input type="text" placeholder="NOMBRE" value="${esc(k)}" oninput="flushVars()">
    <input type="text" placeholder="valor"  value="${esc(v)}" oninput="flushVars()">
    <button class="btn-x" onclick="this.closest('.var-row').remove();flushVars()" title="Eliminar">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  document.getElementById('varList').appendChild(row);
  if (!k) row.querySelector('input').focus();
}
function rebuildVars(arr) {
  document.getElementById('varList').innerHTML = '';
  arr.forEach(e => addVar(e.key, e.value));
}
function flushVars() {
  const c = col(); if (!c) return;
  c.env = [...document.querySelectorAll('.var-row')].map(r => {
    const ins = r.querySelectorAll('input');
    return { key: ins[0].value.trim(), value: ins[1].value };
  }).filter(e => e.key);
}
function currentVars() {
  const vars = {};
  (col()?.env || []).forEach(e => vars[e.key] = e.value);
  return Object.assign(vars, RUN_VARS);
}
function renderVars(text, vars) {
  return String(text ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k) => k in vars ? vars[k] : m);
}
function withVars(s) {
  const v = currentVars(), r = t => renderVars(t, v);
  return { ...s, url: r(s.url), body: r(s.body),
    headers: (s.headers || []).map(h => ({ key: h.key, value: r(h.value) })),
    form_fields: (s.form_fields || []).map(f => ({ key: f.key, value: r(f.value) })) };
}

/* Extracción: "data.token", "header:X-Token", "cookie:sid", "regex:token=(\w+)" */
function extractValue(res, path) {
  if (path.startsWith('header:')) {
    const k = path.slice(7).trim().toLowerCase();
    const e = Object.entries(res.headers || {}).find(([h]) => h.toLowerCase() === k);
    return e ? e[1] : null;
  }
  if (path.startsWith('cookie:')) {
    const k = path.slice(7).trim();
    for (const d of Object.values(COOKIE_JAR)) if (k in d) return d[k];
    return null;
  }
  if (path.startsWith('regex:')) {
    try { const m = String(res.body || '').match(new RegExp(path.slice(6))); return m ? (m[1] ?? m[0]) : null; }
    catch (_) { return null; }
  }
  let cur; try { cur = JSON.parse(res.body); } catch (_) { return null; }
  for (const p of path.split('.')) { if (cur == null || typeof cur !== 'object') return null; cur = cur[p]; }
  return cur == null ? null : typeof cur === 'object' ? JSON.stringify(cur) : String(cur);
}
function collectVars(s, res) {
  if (res.error) return;
  const got = [];
  (s.chain_extracts || []).forEach(e => {
    const v = extractValue(res, e.path);
    if (v !== null) { RUN_VARS[e.var] = v; got.push(e.var); }
  });
  if (got.length) toast('{{' + got.join('}} {{') + '}}', '#64d2ff');
}

/* ─── Utilities ──────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtJson() {
  const ta = document.getElementById('bodyTa');
  try { ta.value = JSON.stringify(JSON.parse(ta.value), null, 2); syncField(); }
  catch (e) { toast('JSON inválido: ' + e.message, '#ff453a'); }
}
function toast(msg, color = '#ffffff') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-dot" style="background:${color}"></span>${esc(msg)}`;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }, 2200);
}

/* ─── Keyboard shortcuts ─────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runStep(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 's')     { e.preventDefault(); saveCol(); }
  if (e.key === 'Escape') {
    clearSearch();
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  }
  if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && e.key === 'f' && document.activeElement.closest('.resp-panel'))) {
    e.preventDefault();
    document.getElementById('searchIn')?.focus();
  }
});

// Pegar un cURL en la URL lo importa directo
document.addEventListener('paste', e => {
  if (e.target.id !== 'urlIn') return;
  const txt = e.clipboardData?.getData('text') || '';
  if (Curl2Py.isCurl(txt)) { e.preventDefault(); importCurl(txt); }
});

// Auto-format JSON on paste
document.addEventListener('paste', e => {
  if (e.target.id === 'bodyTa') {
    setTimeout(() => {
      try { e.target.value = JSON.stringify(JSON.parse(e.target.value), null, 2); syncField(); } catch (_) {}
    }, 50);
  }
});
