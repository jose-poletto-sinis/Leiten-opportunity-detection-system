# Criterios de aceptación — Pantalla de extracción inteligente

Mapeo de cada criterio del ticket al lugar del código donde se cumple.

| #  | Criterio                                                                                    | Dónde se cumple                                                                                          |
|----|---------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| 1  | La pantalla valida que la URL sea válida antes de enviar la solicitud.                      | `frontend/lib/validators.ts` (`isValidUrl`) + uso en `ScrapeForm.tsx`. También validación server-side en Pydantic (`HttpUrl` en `backend/app/models.py`).      |
| 2  | El campo de texto en lenguaje natural es obligatorio.                                       | `validateForm` (front) + `min_length=3` y `field_validator` en `ScrapeRequest.prompt`.                   |
| 3  | Mientras se ejecuta el scraping se muestra un indicador de carga.                           | Spinner CSS + texto "Analizando..." en `app/intel/page.tsx` cuando `status === "loading"`.               |
| 4  | Si el flujo falla o no encuentra info, se muestra un mensaje claro al usuario.              | Banner `.banner--error` con mensajes traducidos por `error_code`. Casos cubiertos: `SCRAPE_TIMEOUT`, `SCRAPE_FAILED`, `EXTRACTION_FAILED`, `INVALID_INPUT`. |
| 5  | La tabla de resultados es legible, columnas dinámicas, scroll horizontal si hay muchas.     | `ResultsTable.tsx` + `.table-wrap { overflow-x: auto }` en `globals.css`. Header sticky.                 |
| 6  | Los botones "Guardar" y "Descartar" están visibles solo después de obtener la respuesta.    | Sección `{status === "result" && result && ( ... )}` en `app/intel/page.tsx`.                            |
| 7  | Al guardar, se confirma la persistencia con un mensaje de éxito.                            | Banner `.banner--success` que muestra el mensaje devuelto por `/v1/intel/save`.                          |

## Consideraciones técnicas adicionales (cubiertas)

- **Timeout 60–90s:** `SCRAPING_TIMEOUT_SECONDS=75` por defecto, hard-cap de `+5s` en `asyncio.wait_for`.
- **Logging por solicitud:** cada llamada escribe `request | response | save | discard | error` en `scrape_audit_log` con `url`, `prompt`, `user_id`, `request_id`, `timestamp`.
- **Modelo de persistencia:** definido en `docs/data-model.md` (tabla `intel_scrape_records` + audit log).

## Fuera de alcance (explícitos)

- Sitios con login/autenticación (Scrapy se queda en GET público; respeta `robots.txt`).
- Edición manual de los resultados antes de guardar — se evalúa en una segunda iteración.
