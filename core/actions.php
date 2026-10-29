<?php
require_once __DIR__ . '/request.php';

/* Ejecuta en orden los requests parseados desde los cURL, con un jar de cookies compartido (como requests.Session). */
function action_run(): void {
    header('Content-Type: application/json');
    $reqs = json_decode($_POST['requests'] ?? '[]', true) ?: [];
    $jar  = [];
    $out  = [];
    foreach (array_slice($reqs, 0, 50) as $r) {
        $url = trim($r['url'] ?? '');
        if (!$url) { $out[] = ['error' => 'URL vacía']; continue; }
        $headers = array_map(fn($h) => ['key' => $h[0] ?? '', 'value' => $h[1] ?? ''], $r['headers'] ?? []);
        $body = isset($r['form'])
            ? array_column(array_map(fn($f) => [$f[0] ?? '', $f[1] ?? ''], $r['form']), 1, 0)
            : (string)($r['body'] ?? '');
        $options = ['timeout' => 30, 'cookie_jar' => &$jar, 'insecure' => !empty($r['insecure'])];
        $res = make_request($url, strtoupper($r['method'] ?? 'GET'), $headers, $body, 'raw', $options);
        unset($options);
        $res['method'] = strtoupper($r['method'] ?? 'GET');
        $res['url'] = $url;
        $out[] = $res;
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
