# Cambios

## cURL → automatización
- Una sola entrada: pega uno o varios `curl` (en el cuadro o en cualquier parte de la página).
- Se genera al instante un script Python listo: `requests.Session`, una función por request y `main()` que los ejecuta en orden.
- URL, método, query, headers, cookies, auth y body salen del cURL; no hay que copiar nada a mano.
- Valores repetidos arriba: dominio de la tienda (`SHOP`), token (`TOKEN`), headers y cookies comunes (`HEADERS`, `COOKIES`).
- GraphQL: el `query` queda como texto triple-comillas indentado y se envía con `json=`.
- Copiar, Descargar (`automatizacion.py`) y Ejecutar (Ctrl+Enter): corre los requests en el servidor con cookies compartidas y muestra estado, tiempo y respuesta.
- Se eliminó el editor por pasos, las colecciones y el código asociado.

## Diseño
- Nuevo tema oscuro por capas, tipografía Inter (mono solo en código) y botón principal Ejecutar.
- Zona para pegar o soltar cURL o .har; lista de requests con método por color y botón para quitar.
- Script con resaltado y números de línea; respuestas plegables con estado por color, Body y Headers.
- Limpiar (Esc / Ctrl+L). Recargar la página empieza vacío: ya no se guarda nada en el navegador.

## Encadenamiento
- Filtra assets y tracking al pegar "Copy all as cURL".
- Tras Ejecutar, regenera el script: tokens, cookies de sesión, Location/URL de checkout y campos HTML se extraen en runtime.
- Chips en cada request (`token ← 2`). Las cookies que pone la respuesta las maneja la sesión.
