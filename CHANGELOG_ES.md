# Cambios

## cURL → automatización
- Una sola entrada: pega uno o varios `curl` (en el cuadro o en cualquier parte de la página).
- Se genera al instante un script Python listo: `requests.Session`, una función por request y `main()` que los ejecuta en orden.
- URL, método, query, headers, cookies, auth y body salen del cURL; no hay que copiar nada a mano.
- Valores repetidos arriba: dominio de la tienda (`SHOP`), token (`TOKEN`), headers y cookies comunes (`HEADERS`, `COOKIES`).
- GraphQL: el `query` queda como texto triple-comillas indentado y se envía con `json=`.
- Copiar, Descargar (`automatizacion.py`) y Ejecutar (Ctrl+Enter): corre los requests en el servidor con cookies compartidas y muestra estado, tiempo y respuesta.
- Se eliminó el editor por pasos, las colecciones y el código asociado.
