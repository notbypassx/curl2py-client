<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/request.php';

function handle_action(string $act): void {
    header('Content-Type: application/json');
    if      ($act === 'execute')     action_execute();
    elseif  ($act === 'execute_all') action_execute_all();
    elseif  ($act === 'save')        action_save();
    elseif  ($act === 'delete')      action_delete();
    else echo json_encode(['error' => 'Unknown action']);
}

/* ── Ejecutar un único step ──────────────────────────────────────────────── */
function action_execute(): void {
    $url       = trim($_POST['url'] ?? '');
    $body_type = $_POST['body_type'] ?? 'raw';

    if (!$url) { echo json_encode(['error' => 'URL vacía']); return; }

    $body = build_body($body_type);

    // Contexto: jar de cookies y variables de chaining que llegan desde JS
    $cookie_jar = json_decode($_POST['cookie_jar'] ?? '{}', true) ?? [];
    $options = [
        'timeout'    => max(1, (int)($_POST['timeout'] ?? 30)),
        'proxy'      => trim($_POST['proxy'] ?? ''),
        'cookie_jar' => &$cookie_jar,
        'insecure'   => !empty($_POST['insecure']),
    ];

    $result = make_request(
        $url,
        strtoupper(trim($_POST['method'] ?? 'GET')),
        json_decode($_POST['headers_json'] ?? '[]', true) ?? [],
        $body,
        $body_type,
        $options
    );

    // Devolver el jar actualizado para que JS lo conserve
    $result['cookie_jar'] = $cookie_jar;
    echo json_encode($result);
}

/* ── Ejecutar toda la colección (server-side, con jar compartido) ───────── */
function action_execute_all(): void {
    $steps     = json_decode($_POST['steps_json'] ?? '[]', true) ?? [];
    $cookie_jar = json_decode($_POST['cookie_jar'] ?? '{}', true) ?? [];
    $timeout   = max(1, (int)($_POST['timeout'] ?? 30));
    $proxy     = trim($_POST['proxy'] ?? '');

    // Variables: las de la colección + las extraídas en ejecuciones previas
    $chain_vars = array_map('strval', json_decode($_POST['vars_json'] ?? '{}', true) ?: []);

    $results = [];
    foreach ($steps as $i => $s) {
        $url = apply_chain($s['url'] ?? '', $chain_vars);
        if (!$url) {
            $results[] = ['error' => 'URL vacía', 'step' => $i];
            continue;
        }

        // Interpolar variables en headers y body
        $headers = array_map(fn($h) => [
            'key'   => $h['key']   ?? '',
            'value' => apply_chain($h['value'] ?? '', $chain_vars),
        ], $s['headers'] ?? []);

        $body_type = $s['body_type'] ?? 'raw';
        $body_raw  = apply_chain($s['body'] ?? '', $chain_vars);
        $body      = build_body_from_step($body_type, $body_raw, $s['form_fields'] ?? []);

        $options = [
            'timeout'    => $timeout,
            'proxy'      => $proxy,
            'cookie_jar' => &$cookie_jar,
            'insecure'   => !empty($s['insecure']),
        ];

        $res = make_request(
            $url,
            strtoupper(trim($s['method'] ?? 'GET')),
            $headers,
            $body,
            $body_type,
            $options
        );

        // Registrar variables de chaining a partir de esta respuesta
        if (empty($res['error'])) {
            foreach ($s['chain_extracts'] ?? [] as $ex) {
                $varname = trim($ex['var'] ?? '');
                $path    = trim($ex['path'] ?? '');
                if (!$varname || !$path) continue;
                $val = extract_value($res, $path, $cookie_jar);
                if ($val !== null) $chain_vars[$varname] = $val;
            }
        }

        $res['step']        = $i;
        $res['cookie_jar']  = $cookie_jar;     // snapshot tras cada step
        $results[] = $res;
    }

    echo json_encode(['results' => $results, 'cookie_jar' => $cookie_jar, 'vars' => (object)$chain_vars]);
}

/* ── Guardar colección ───────────────────────────────────────────────────── */
function action_save(): void {
    $db  = db_load();
    $id  = trim($_POST['id'] ?? '') ?: uniqid('col_', true);
    $col = json_decode($_POST['data'] ?? '{}', true) ?? [];

    $col['id']       = $id;
    $col['saved_at'] = date('Y-m-d H:i:s');

    $found = false;
    foreach ($db as &$c) {
        if ($c['id'] === $id) { $c = $col; $found = true; break; }
    }
    if (!$found) $db[] = $col;

    db_save($db);
    echo json_encode(['ok' => true, 'id' => $id, 'col' => $col]);
}

/* ── Eliminar colección ──────────────────────────────────────────────────── */
function action_delete(): void {
    $db = array_filter(db_load(), fn($c) => $c['id'] !== ($_POST['id'] ?? ''));
    db_save($db);
    echo json_encode(['ok' => true]);
}

/* ── Helpers internos ────────────────────────────────────────────────────── */

function build_body(string $body_type) {
    if ($body_type === 'form') {
        $fields = json_decode($_POST['form_fields_json'] ?? '[]', true) ?? [];
        $body   = [];
        foreach ($fields as $f) {
            if (!empty($f['key'])) $body[$f['key']] = $f['value'] ?? '';
        }
        return $body;
    }
    return normalize_body($body_type, $_POST['body'] ?? '');
}

function build_body_from_step(string $body_type, string $body_raw, array $form_fields) {
    if ($body_type === 'form') {
        $body = [];
        foreach ($form_fields as $f) {
            if (!empty($f['key'])) $body[$f['key']] = $f['value'] ?? '';
        }
        return $body;
    }
    return normalize_body($body_type, $body_raw);
}

/** URL Encoded: la UI usa una línea por campo → unir con & */
function normalize_body(string $body_type, string $body): string {
    $body = trim($body);
    if ($body_type === 'urlenc') {
        $lines = array_filter(array_map('trim', preg_split('/\R|&/', $body)), 'strlen');
        return implode('&', $lines);
    }
    return $body;
}

/**
 * Reemplaza {{VAR}} con su valor del mapa de variables de chaining.
 */
function apply_chain(string $text, array $vars): string {
    if (!$vars || strpos($text, '{{') === false) return $text;
    return preg_replace_callback('/\{\{([^}]+)\}\}/', function($m) use ($vars) {
        return $vars[trim($m[1])] ?? $m[0];
    }, $text);
}

/**
 * Extrae un valor de la respuesta:
 *   "data.token"  (JSON, notación punto) · "header:X-Token" · "cookie:sid" · "regex:token=(\w+)"
 */
function extract_value(array $res, string $path, array $jar) {
    if (stripos($path, 'header:') === 0) {
        $k = strtolower(trim(substr($path, 7)));
        foreach ($res['headers'] ?? [] as $h => $v) if (strtolower($h) === $k) return (string)$v;
        return null;
    }
    if (stripos($path, 'cookie:') === 0) {
        $k = trim(substr($path, 7));
        foreach ($jar as $cookies) if (isset($cookies[$k])) return (string)$cookies[$k];
        return null;
    }
    if (stripos($path, 'regex:') === 0) {
        $re = '~' . str_replace('~', '\~', substr($path, 6)) . '~';
        if (@preg_match($re, $res['body'] ?? '', $m)) return $m[1] ?? $m[0];
        return null;
    }
    $data = json_decode($res['body'] ?? '', true);
    return is_array($data) ? extract_json_path($data, $path) : null;
}

/**
 * Navega un array PHP usando notación punto: "data.user.token"
 */
function extract_json_path(array $data, string $path) {
    $parts = explode('.', $path);
    $cur   = $data;
    foreach ($parts as $p) {
        if (!is_array($cur) || !array_key_exists($p, $cur)) return null;
        $cur = $cur[$p];
    }
    return is_scalar($cur) ? (string)$cur : json_encode($cur);
}
