# Cambios

## cURL → Python (requests)
- **Importar → cURL**: pega un `curl` (Chrome/Firefox "Copiar como cURL", bash o cmd de Windows) y se crea el paso. El código Python aparece al instante en la pestaña **Código**.
- Atajo: pegar un `curl` directamente en la barra de URL también lo importa.
- Soporta: `-X`, `-H`, cookies (`-b` / header Cookie), `-d`, `--data-raw`, `--data-binary`, `--data-urlencode`, `--json`, `-F` (incluye archivos `@`), `-u`, `-k`, `-G`, `-I`, `-A`, `-e`, `-x`, `-m`, `$'...'`, comillas y saltos `\`.
- **Código** ahora tiene selector **Python / PHP** (Python por defecto), con **Copiar**, **Descargar** (.py / .php) y **Flujo**.

## Automatizaciones
- **Variables** (pestaña nueva, por colección): `NOMBRE = valor`, usables como `{{NOMBRE}}` en URL, headers y body. Se guardan con la colección.
- **Extraer** (antes "Chaining"): además de rutas JSON (`data.items.0.id`) acepta `header:X-Token`, `cookie:sid` y `regex:token=(\w+)`. Ahora también funciona con **Ejecutar** (un paso), no solo con Ejecutar todo; los valores quedan disponibles para los siguientes pasos.
- **Flujo**: genera un script Python único de toda la colección (`requests.Session`, cookies compartidas, variables, extracciones, resumen final, `STOP_ON_ERROR`, `DELAY_SECONDS`). Las variables se pueden sobrescribir por entorno: `TOKEN=abc python flujo.py`.

## Diseño
- Textos en español y cortos (Ejecutar, Ejecutar todo, Importar, Extraer, Código, Variables).
- Se quitaron textos explicativos; un solo modal de importación con selector cURL / DevTools.
- Mayor contraste en textos secundarios y botones.

## Correcciones
- URL Encoded: el body (una línea por campo) ahora se envía unido con `&` y con su `Content-Type`.
- Respuestas comprimidas (gzip/br) se decodifican.
- `curl -k` respeta el modo sin verificación SSL.
- El contador de pasos de la barra lateral se actualiza al agregar/quitar pasos.
- Eliminado "Guardar .php" en servidor (reemplazado por Descargar, sin escribir archivos en el servidor).

## Archivos
- Nuevo: `assets/curl2py.js`
- Modificados: `index.php`, `assets/app.js`, `assets/app.css`, `core/actions.php`, `core/request.php`

## cURL primero
- Pegar un `curl` en cualquier parte de la página (barra de URL, modal Importar o fuera de un campo) llena al instante el paso actual: URL, método, query, headers, cookies, auth y body.
- Python: detecta el dominio de la tienda y el token (`X-…-Access-Token`, `Authorization`, `X-API-Key`) y los pone arriba como `SHOP` y `TOKEN`; en Flujo pasan a `VARS`.
- GraphQL: el `query` se escribe como texto triple-comillas legible y se envía con `json=`.
- Al cargar un paso ya no quedan restos del body/form de otro paso, ni un `Content-Type: application/json` agregado de más.
