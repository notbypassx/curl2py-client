<?php

/**
 * Extrae el dominio base (scheme + host) de una URL para agrupar cookies por dominio.
 */
function get_domain(string $url): string {
    $p = parse_url($url);
    if (!$p || empty($p['host'])) return $url;
    return ($p['scheme'] ?? 'http') . '://' . $p['host'];
}

/**
 * Parsea los headers Set-Cookie de una respuesta cURL y devuelve un array
 * asociativo [ nombre => valor ] listo para fusionar con el jar existente.
 */
function parse_set_cookies(string $raw_headers): array {
    $cookies = [];
    foreach (explode("\r\n", $raw_headers) as $line) {
        if (stripos($line, 'set-cookie:') === 0) {
            $parts = explode(';', substr($line, 11));       // quita "Set-Cookie:"
            $kv    = explode('=', trim($parts[0]), 2);
            if (count($kv) === 2) {
                $cookies[trim($kv[0])] = trim($kv[1]);
            }
        }
    }
    return $cookies;
}

/**
 * Convierte el cookie jar [ nombre => valor ] al string que cURL espera.
 */
function jar_to_string(array $jar): string {
    return implode('; ', array_map(fn($k, $v) => "$k=$v", array_keys($jar), $jar));
}

/**
 * Ejecuta un request HTTP.
 *
 * @param  string  $url
 * @param  string  $method
 * @param  array   $headers     [ ['key'=>'...','value'=>'...'], ... ]
 * @param  mixed   $body        string | array
 * @param  string  $body_type   'raw' | 'json' | 'form' | 'urlencoded' | 'none'
 * @param  array   $options {
 *   timeout   int     segundos (default 30)
 *   proxy     string  'http://host:port' | 'socks5://host:port' | ''
 *   cookie_jar array  [ dominio => [ nombre => valor ] ]  (se modifica por referencia)
 *   insecure   bool    no verificar SSL (curl -k)
 * }
 * @return array   respuesta con claves: status, time_ms, size, headers, body, is_json, cookies_received
 */
function make_request(
    string $url,
    string $method,
    array  $headers,
    $body,
    string $body_type = 'raw',
    array  &$options  = []
): array {

    // ── Opciones ──────────────────────────────────────────────────────────
    $timeout  = (int)  ($options['timeout']    ?? 30);
    $proxy    = (string)($options['proxy']     ?? '');
    $jar      = &$options['cookie_jar'];         // referencia al jar global
    $domain   = get_domain($url);

    // ── Cookies entrantes desde el jar ────────────────────────────────────
    $domain_cookies = $jar[$domain] ?? [];

    // Mezclar: el jar tiene prioridad sobre cualquier header Cookie manual
    $manual_cookie_hdr = '';
    foreach ($headers as $h) {
        if (strtolower($h['key'] ?? '') === 'cookie') {
            $manual_cookie_hdr = $h['value'] ?? '';
            break;
        }
    }
    // Parsear cookies manuales y dejarlas como base; el jar sobreescribe
    $merged = [];
    if ($manual_cookie_hdr) {
        foreach (explode(';', $manual_cookie_hdr) as $pair) {
            $kv = explode('=', trim($pair), 2);
            if (count($kv) === 2) $merged[trim($kv[0])] = trim($kv[1]);
        }
    }
    $merged = array_merge($merged, $domain_cookies); // jar gana

    // ── Iniciar cURL ──────────────────────────────────────────────────────
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER         => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_SSL_VERIFYPEER => empty($options['insecure']),
        CURLOPT_SSL_VERIFYHOST => empty($options['insecure']) ? 2 : 0,
        CURLOPT_ENCODING       => '',          // acepta gzip/br (curl --compressed)
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 10,
    ]);

    // Proxy
    if ($proxy) {
        curl_setopt($ch, CURLOPT_PROXY, $proxy);
        if (stripos($proxy, 'socks5') === 0) {
            curl_setopt($ch, CURLOPT_PROXYTYPE, CURLPROXY_SOCKS5);
        } elseif (stripos($proxy, 'socks4') === 0) {
            curl_setopt($ch, CURLOPT_PROXYTYPE, CURLPROXY_SOCKS4);
        }
    }

    // ── Headers ──────────────────────────────────────────────────────────
    $ch_headers = [];
    $has_ct     = false;
    foreach ($headers as $h) {
        $k = trim($h['key'] ?? '');
        if (!$k) continue;
        $kl = strtolower($k);
        if ($kl === 'cookie') continue;          // lo manejamos nosotros
        if ($kl === 'content-type') $has_ct = true;
        $ch_headers[] = $k . ': ' . trim($h['value'] ?? '');
    }

    // Inyectar cookie header consolidado
    if ($merged) {
        $ch_headers[] = 'Cookie: ' . jar_to_string($merged);
    }

    // Auto Content-Type para urlencoded
    if (in_array($body_type, ['urlenc', 'urlencoded'], true) && !$has_ct) {
        $ch_headers[] = 'Content-Type: application/x-www-form-urlencoded';
    }

    if ($ch_headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $ch_headers);

    // ── Método y body ─────────────────────────────────────────────────────
    $m = strtoupper($method);
    if (in_array($m, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
        if ($m === 'POST') curl_setopt($ch, CURLOPT_POST, true);
        else               curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);

        $has_body = (is_array($body) && count($body) > 0)
                 || (is_string($body) && $body !== '');
        if ($has_body) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    // ── Ejecutar ──────────────────────────────────────────────────────────
    $raw         = curl_exec($ch);
    $err         = curl_error($ch);
    $code        = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $header_size = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $ms          = (int) round(curl_getinfo($ch, CURLINFO_TOTAL_TIME) * 1000);
    $final_url   = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);

    if ($err) return ['error' => $err];

    $raw_headers = substr($raw, 0, $header_size);
    $resp_body   = substr($raw, $header_size);

    // ── Parsear headers de respuesta ──────────────────────────────────────
    $resp_headers = [];
    foreach (explode("\r\n", $raw_headers) as $line) {
        $ci = strpos($line, ':');
        if ($ci !== false) {
            $resp_headers[trim(substr($line, 0, $ci))] = trim(substr($line, $ci + 1));
        }
    }

    // ── Actualizar cookie jar con Set-Cookie recibidos ────────────────────
    $new_cookies = parse_set_cookies($raw_headers);
    if ($new_cookies) {
        if (!isset($jar[$domain])) $jar[$domain] = [];
        $jar[$domain] = array_merge($jar[$domain], $new_cookies);
    }

    // ── Respuesta ─────────────────────────────────────────────────────────
    $decoded = json_decode($resp_body, true);
    return [
        'status'           => $code,
        'time_ms'          => $ms,
        'size'             => strlen($resp_body),
        'headers'          => $resp_headers,
        'body'             => $decoded !== null
            ? json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            : $resp_body,
        'is_json'          => $decoded !== null,
        'cookies_received' => $new_cookies,
        'final_url'         => $final_url,
    ];
}
