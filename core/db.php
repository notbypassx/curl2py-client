<?php
define('STORE_PATH', dirname(__DIR__) . '/collections.json');

function db_load(): array {
    if (!file_exists(STORE_PATH)) return [];
    return json_decode(file_get_contents(STORE_PATH), true) ?? [];
}

function db_save(array $data): void {
    file_put_contents(
        STORE_PATH,
        json_encode(array_values($data), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );
}
