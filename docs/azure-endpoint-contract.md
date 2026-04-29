# Contrato del endpoint Azure — `intel-scraper`

Documento de coordinación con el área de **Integraciones**. Define el contrato HTTP
entre la pantalla Next.js y el servicio que corre en Azure (FastAPI dockerizado, ver
`backend/`). Si Integraciones decide envolverlo en una **Logic App** o una **Function**
delante, el contrato externo no debería cambiar — solo la URL.

> **Estado:** PROPUESTA. Pendiente de revisión con Integraciones.

---

## Base URL (a definir)

| Ambiente | URL propuesta                                                |
|----------|--------------------------------------------------------------|
| Dev      | `https://leiten-intel-scraper-dev.azurewebsites.net`         |
| Stg      | `https://leiten-intel-scraper-stg.azurewebsites.net`         |
| Prod     | `https://leiten-intel-scraper.azurewebsites.net`             |

Auth: API key en header `x-leiten-api-key` (mismo esquema que el resto de servicios
internos), validada por Azure API Management si se decide poner APIM delante.

---

## 1. `POST /v1/intel/scrape` — Disparar extracción

### Request
```json
{
  "url": "https://www.desarrolladora.com/contacto",
  "prompt": "datos de contacto, CUIT, dirección y razón social de la desarrolladora",
  "user_id": "jose.poletto"
}
```

| Campo     | Tipo      | Requerido | Notas                                          |
|-----------|-----------|-----------|------------------------------------------------|
| `url`     | string    | sí        | URL pública. Se valida formato y protocolo.   |
| `prompt`  | string    | sí        | Lenguaje natural. Mínimo 5 caracteres.         |
| `user_id` | string    | no        | ID del usuario (auditoría). Lo setea el front. |

### Response 200
```json
{
  "request_id": "f3c1d8f2-...-...",
  "url": "https://www.desarrolladora.com/contacto",
  "prompt": "datos de contacto, CUIT, dirección y razón social",
  "columns": ["razon_social", "cuit", "domicilio", "telefono", "email", "obras"],
  "rows": [
    {
      "razon_social": "Desarrolladora SA",
      "cuit": "30-12345678-9",
      "domicilio": "Av. Corrientes 1234, CABA",
      "telefono": "+54 11 4123-4567",
      "email": "info@desarrolladora.com",
      "obras": "Edificio Belgrano R, Torre Caballito"
    }
  ],
  "extracted_at": "2026-04-29T18:42:13.482Z",
  "elapsed_ms": 12480,
  "warnings": []
}
```

`columns` es **dinámico**: el extractor LLM decide qué campos incluir según lo que
encontró en la página. El front renderiza columnas en el orden que llegan.

### Errores

| Status | `error_code`           | Cuándo                                                       |
|--------|------------------------|--------------------------------------------------------------|
| 400    | `INVALID_INPUT`        | URL malformada o prompt vacío.                                |
| 400    | `SCRAPE_FAILED`        | Página no responde, robots.txt la bloquea, requiere login.    |
| 502    | `EXTRACTION_FAILED`    | El modelo LLM falló o devolvió JSON inválido.                 |
| 504    | `SCRAPE_TIMEOUT`       | Superó el timeout configurado (default 75s, máximo 90s).      |

Formato de error:
```json
{
  "detail": {
    "error_code": "SCRAPE_TIMEOUT",
    "message": "El scraping superó el timeout de 75s.",
    "details": { "reason": "..." }
  }
}
```

---

## 2. `POST /v1/intel/save` — Persistir resultado (botón "Guardar")

### Request
```json
{
  "request_id": "f3c1d8f2-...",
  "url": "https://www.desarrolladora.com/contacto",
  "prompt": "datos de contacto...",
  "columns": ["razon_social", "cuit", "..."],
  "rows": [ { "razon_social": "Desarrolladora SA", "...": "..." } ],
  "user_id": "jose.poletto"
}
```

### Response 200
```json
{
  "saved_id": "8e4d...",
  "persisted_rows": 1,
  "message": "Información guardada correctamente"
}
```

---

## 3. `POST /v1/intel/discard` — Botón "Descartar"

Mismo body que `/save`. No persiste registros, solo deja traza en `scrape_audit_log`.

### Response 200
```json
{ "status": "discarded" }
```

---

## 4. `GET /healthz`

Health probe usado por Azure App Service / Container Apps.

```json
{ "status": "ok", "service": "leiten-intel-scraper" }
```

---

## TODOs con Integraciones

- [ ] Confirmar **base URL** y nombres de App Service por ambiente.
- [ ] Decidir si va detrás de **Azure API Management** y bajo qué producto/subscription key.
- [ ] Confirmar mecanismo de **auth interna** (API key vs Entra ID con app registration).
- [ ] Definir **cuotas y rate limits** (sugerencia: 30 req/min por usuario, 200 req/día por org).
- [ ] Coordinar **Application Insights** para logs estructurados (`request_id`, `user_id`, `url`, `prompt_len`, `elapsed_ms`, `rows`, `error_code`).
- [ ] Si se usa **Azure AI Foundry**: pasar el modelo desplegado y la API version definitiva.
- [ ] Si se usa **Logic App / Function** delante: confirmar que mantengan el mismo shape.
- [ ] Definir política de **almacenamiento del HTML crudo** (¿Blob Storage? ¿solo en logs efímeros?).
- [ ] Acordar **retención de auditoría** (sugerencia: 365 días).
