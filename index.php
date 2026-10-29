<?php
require_once __DIR__ . '/core/db.php';
require_once __DIR__ . '/core/actions.php';

$act = $_POST['action'] ?? '';
if ($act) { handle_action($act); exit; }

$db = db_load();
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API Builder</title>
<link rel="stylesheet" href="assets/app.css">
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
</head>
<body>

<!-- TOPBAR -->
<div class="topbar">
  <div class="logo">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    API Builder
    <div class="logo-dot"></div>
  </div>
  <div class="topbar-right">
    <span id="cookieBadge" class="cookie-badge" onclick="clearCookieJar()" title="Haz clic para limpiar cookies"></span>
    <span class="kbd">Ctrl+Enter</span><span style="color:var(--tx3);font-size:.68rem">ejecutar</span>
    &nbsp;
    <span class="kbd">Ctrl+S</span><span style="color:var(--tx3);font-size:.68rem">guardar</span>
  </div>
</div>

<div class="main">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sb-header">
      <span class="sb-title">Colecciones</span>
      <button class="btn-new" onclick="newCol()">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva
      </button>
    </div>
    <div class="sb-list" id="sbList"></div>
  </div>

  <!-- EDITOR -->
  <div class="editor">

    <!-- Collection name -->
    <div class="col-hdr">
      <input class="col-name-in" id="colName" placeholder="Nombre de la colección…" oninput="syncColName()">
      <button class="btn-save" onclick="saveCol()">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Guardar
      </button>
    </div>

    <!-- Step tabs -->
    <div class="step-tabs-row" id="stepTabsRow"></div>

    <!-- Step editor -->
    <div class="step-editor">

      <!-- Step name + meta -->
      <div class="step-name-bar">
        <span class="step-lbl">Paso</span>
        <input class="step-name-in" id="stepName" placeholder="Nombre…" oninput="syncField()">
      </div>

      <!-- URL bar -->
      <div class="url-bar">
        <select class="msel" id="msel" onchange="syncField();updateCode()">
          <option>GET</option><option>POST</option><option>PUT</option>
          <option>PATCH</option><option>DELETE</option><option>HEAD</option>
        </select>
        <input class="url-in" id="urlIn" placeholder="https://api.example.com/endpoint" oninput="syncField();updateCode()">
      </div>

      <!-- Timeout + Proxy row -->
      <div class="meta-bar">
        <label class="meta-lbl">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Timeout
          <input class="meta-in" id="stepTimeout" type="number" min="1" max="300" value="30" oninput="syncField()" style="width:52px"> s
        </label>
        <label class="meta-lbl" style="flex:1">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Proxy
          <input class="meta-in meta-proxy" id="stepProxy" type="text" placeholder="http://127.0.0.1:8080 o socks5://…" oninput="syncField()">
        </label>
      </div>

      <!-- Request tabs -->
      <div class="req-tabs">
        <div class="rtab active" onclick="switchRTab(this,'rHeaders')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Headers
        </div>
        <div class="rtab" onclick="switchRTab(this,'rBody')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Body
        </div>
        <div class="rtab" onclick="switchRTab(this,'rChain')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          Extraer
        </div>
        <div class="rtab" onclick="switchRTab(this,'rCode')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="10" y1="13" x2="14" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Código
        </div>
        <div class="rtab" onclick="switchRTab(this,'rVars')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>
          Variables
        </div>
      </div>

      <!-- HEADERS -->
      <div class="rpanel active" id="rHeaders">
        <div class="h-list" id="hList"></div>
        <button class="btn-addh" onclick="addHeader()">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Agregar header
        </button>
      </div>

      <!-- BODY -->
      <div class="rpanel" id="rBody">
        <div class="btype-row">
          <button class="btype-btn active" data-bt="none"   onclick="setBodyType(this,'none')">None</button>
          <button class="btype-btn"        data-bt="json"   onclick="setBodyType(this,'json')">JSON</button>
          <button class="btype-btn"        data-bt="form"   onclick="setBodyType(this,'form')">Form Data</button>
          <button class="btype-btn"        data-bt="urlenc" onclick="setBodyType(this,'urlenc')">URL Encoded</button>
          <button class="btype-btn"        data-bt="raw"    onclick="setBodyType(this,'raw')">Raw</button>
        </div>
        <!-- None -->
        <div class="bpanel active" id="bp-none">
          <p style="color:var(--tx3);font-size:.75rem;padding:8px 0">Sin body</p>
        </div>
        <!-- JSON -->
        <div class="bpanel" id="bp-json">
          <textarea class="body-ta" id="bodyTa" placeholder='{"key": "value"}' oninput="syncField();updateCode()"></textarea>
          <div class="body-actions">
            <button class="btn-g" onclick="fmtJson()">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Format JSON
            </button>
            <button class="btn-g" onclick="document.getElementById('bodyTa').value='';syncField()">Clear</button>
          </div>
        </div>
        <!-- Form Data -->
        <div class="bpanel" id="bp-form">
          <div class="fd-toolbar">
            <span class="fd-label">Campos</span>
            <span class="fd-count" id="fdCount">0 campos</span>
            <button class="btn-g" onclick="openMultipartModal()" style="margin-left:auto">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Pegar multipart
            </button>
          </div>
          <div class="fd-table">
            <div class="fd-thead"><span>Campo</span><span>Valor</span><span></span></div>
            <div class="fd-body" id="fdList"></div>
          </div>
          <button class="btn-addh" onclick="addFormField()" style="margin-top:6px">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar campo
          </button>
        </div>
        <!-- URL Encoded -->
        <div class="bpanel" id="bp-urlenc">
          <textarea class="body-ta" id="bodyUrlenc" placeholder="key=value&#10;key2=value2" oninput="syncField();updateCode()"></textarea>
        </div>
        <!-- Raw -->
        <div class="bpanel" id="bp-raw">
          <textarea class="body-ta" id="bodyRaw" placeholder="Contenido raw…" oninput="syncField();updateCode()"></textarea>
        </div>
      </div>

      <!-- CHAIN -->
      <div class="rpanel" id="rChain">
        <div class="chain-list" id="chainList"></div>
        <button class="btn-addh" onclick="addChainExtract()" style="margin-top:6px">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Agregar extracción
        </button>
      </div>

      <!-- VARIABLES (colección) -->
      <div class="rpanel" id="rVars">
        <div class="h-list" id="varList"></div>
        <button class="btn-addh" onclick="addVar()">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Variable
        </button>
      </div>

      <!-- CÓDIGO -->
      <div class="rpanel" id="rCode">
        <div class="code-actions">
          <div class="seg" id="langSeg">
            <button class="seg-btn active" data-lang="py"  onclick="setLang('py')">Python</button>
            <button class="seg-btn"        data-lang="php" onclick="setLang('php')">PHP</button>
          </div>
          <button class="btn-g" onclick="cpCode()"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar</button>
          <button class="btn-g" onclick="downloadCode()"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Descargar</button>
          <button class="btn-g" onclick="generateFlow()" title="Todos los pasos"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg> Flujo</button>
          <button class="btn-g" onclick="resetCode()" id="btnResetCode" style="margin-left:auto;opacity:.35" title="Regenerar"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg></button>
        </div>
        <div class="code-wrap">
          <textarea class="code-editor" id="codeTxt" spellcheck="false"></textarea>
        </div>
      </div>

    </div><!-- /step-editor -->

    <!-- Action bar -->
    <div class="action-bar">
      <button class="btn-run" id="btnRun" onclick="runStep()">
        <div class="spin-ring"></div>
        <span class="run-label">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Ejecutar
        </span>
      </button>
      <button class="btn-all" id="btnAll" onclick="runAll()">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        <span class="run-all-label">Ejecutar todo</span>
      </button>
      <button class="btn-import" onclick="openImport()">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Importar
      </button>
    </div>

  </div><!-- /editor -->

  <!-- RESPONSE -->
  <div class="resp-panel">
    <div class="resp-hdr">
      <span class="resp-title">Respuesta</span>
      <span id="runBadge" class="run-badge"></span>
    </div>
    <!-- Search bar -->
    <div class="resp-search">
      <div class="search-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-in" id="searchIn" type="text" placeholder="Buscar en respuesta…" oninput="onSearch(this.value)">
        <span class="search-count" id="searchCount"></span>
      </div>
      <div class="search-nav">
        <button onclick="searchPrev()" title="Anterior (Shift+Enter)">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button onclick="searchNext()" title="Siguiente (Enter)">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button onclick="clearSearch()" title="Limpiar búsqueda">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="resp-scroll" id="respScroll">
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <h4>Sin respuesta</h4>
        <p>Ejecuta un paso para ver la respuesta.</p>
      </div>
    </div>
  </div>

</div><!-- /main -->

<!-- IMPORT MODAL (cURL / DevTools) -->
<div class="overlay" id="importOverlay" onclick="if(event.target===this)closeImport()">
  <div class="modal">
    <div class="modal-hdr">
      <h3>Importar</h3>
      <button class="btn-cancel" onclick="closeImport()" style="padding:4px 8px;border-radius:6px">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="seg" id="impSeg">
        <button class="seg-btn active" data-imp="curl" onclick="setImpMode('curl')">cURL</button>
        <button class="seg-btn" data-imp="devtools" onclick="setImpMode('devtools')">DevTools</button>
      </div>
      <textarea class="modal-ta" id="rawHeadersTa" rows="11" placeholder="curl 'https://…' -H '…'"></textarea>
      <div id="impDevtoolsOpts" style="display:none;flex-direction:column;gap:10px">
        <textarea class="modal-ta" id="rawBodyTa" rows="3" placeholder="Body"></textarea>
        <div class="modal-opts">
          <label class="chk-opt"><input type="checkbox" id="optAccept" checked> accept</label>
          <label class="chk-opt"><input type="checkbox" id="optCookie" checked> cookie</label>
          <label class="chk-opt"><input type="checkbox" id="optOrigin"> origin</label>
          <label class="chk-opt"><input type="checkbox" id="optReferer"> referer</label>
          <label class="chk-opt"><input type="checkbox" id="optUA"> user-agent</label>
          <label class="chk-opt"><input type="checkbox" id="optLang"> accept-language</label>
        </div>
      </div>
      <label class="chk-opt" id="impNewStepWrap"><input type="checkbox" id="optNewStep"> Nuevo paso</label>
    </div>
    <div class="modal-ftr">
      <button class="btn-cancel" onclick="closeImport()">Cancelar</button>
      <button class="btn-primary" onclick="doImport()">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Importar
      </button>
    </div>
  </div>
</div>

<!-- MULTIPART MODAL -->
<div class="overlay" id="mpOverlay" onclick="if(event.target===this)closeMpModal()">
  <div class="modal" style="width:640px">
    <div class="modal-hdr">
      <h3>Pegar multipart / form-data</h3>
      <button class="btn-cancel" onclick="closeMpModal()" style="padding:4px 8px;border-radius:6px">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <label class="modal-label">Pega el payload completo en formato WebKitFormBoundary</label>
      <textarea class="modal-ta" id="mpRaw" rows="14"
        placeholder="------WebKitFormBoundary...&#10;Content-Disposition: form-data; name=&quot;field&quot;&#10;&#10;value&#10;------WebKitFormBoundary..."></textarea>
    </div>
    <div class="modal-ftr">
      <button class="btn-cancel" onclick="closeMpModal()">Cancelar</button>
      <button class="btn-primary" onclick="doParseMultipart()">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Parsear campos
      </button>
    </div>
  </div>
</div>

<script>
window.INIT_COLLECTIONS = <?= json_encode(array_values($db), JSON_UNESCAPED_UNICODE) ?>;
</script>
<script src="assets/curl2py.js"></script>
<script src="assets/app.js"></script>
</body>
</html>
