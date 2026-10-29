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
<header>
  <b>curl2py</b>
  <span id="count"></span>
  <nav>
    <button id="copy">Copiar</button>
    <button id="download">Descargar</button>
    <button id="run" class="primary">Ejecutar</button>
  </nav>
</header>
<main>
  <textarea id="curls" spellcheck="false" placeholder="curl …"></textarea>
  <section>
    <pre id="code"></pre>
    <div id="results"></div>
  </section>
</main>
<div id="toast"></div>
<script src="assets/curl2py.js"></script>
<script src="assets/app.js"></script>
</body>
</html>
