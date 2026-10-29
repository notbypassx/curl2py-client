<?php
require_once __DIR__ . '/core/actions.php';
if (($_POST['action'] ?? '') === 'run') { action_run(); exit; }
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>curl2py</title>
<link rel="stylesheet" href="assets/app.css">
</head>
<body>
<header class="bar">
  <div class="brand">
    <span class="mark"><svg viewBox="0 0 24 24"><path d="m4 17 6-5-6-5M12 19h8"/></svg></span>
    <span>curl2py</span>
    <span id="count" class="chip" hidden></span>
  </div>
  <nav>
    <button id="clear" class="ghost" title="Esc"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg><span>Limpiar</span></button>
    <button id="copy" class="ghost"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg><span>Copiar</span></button>
    <button id="download" class="ghost"><svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/></svg><span>Descargar</span></button>
    <button id="run" class="primary" title="Ctrl+Enter"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg><span>Ejecutar</span></button>
  </nav>
</header>

<main>
  <div class="col">
    <section class="card" id="reqCard">
      <div class="card-h"><span>Requests</span></div>
      <label id="drop" class="drop">
        <svg viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
        <b>Pega o suelta un cURL</b>
        <small>Ctrl+V · .har</small>
        <input type="file" id="file" accept=".har,.txt,.sh,application/json" hidden>
      </label>
      <ul id="list" class="list"></ul>
      <textarea id="add" class="add" rows="1" spellcheck="false" placeholder="+ curl …" hidden></textarea>
    </section>
    <section class="card" id="resCard" hidden>
      <div class="card-h"><span>Respuestas</span><span id="resSum" class="muted"></span></div>
      <div id="results" class="results"></div>
    </section>
  </div>

  <section class="card code-card">
    <div class="card-h"><span class="file">automatizacion.py</span></div>
    <div id="code" class="code"><div class="code-empty"><svg viewBox="0 0 24 24"><path d="m8 7-5 5 5 5m8-10 5 5-5 5"/></svg></div></div>
  </section>
</main>
<div id="toast" class="toast"></div>
<script src="assets/curl2py.js"></script>
<script src="assets/app.js"></script>
</body>
</html>
