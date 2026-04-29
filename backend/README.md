# Backend — Leiten Intel Scraper

Servicio Python (Scrapy + FastAPI + extractor LLM) que recibe una URL y un prompt en
lenguaje natural y devuelve filas estructuradas para mostrar en una tabla.

## Stack

- **FastAPI** — capa HTTP, validación con Pydantic, OpenAPI auto-generado.
- **Scrapy** — descarga de la página, respeto de robots.txt, retries, user-agent identificado.
- **Crochet** — integración del reactor de Twisted con un proceso síncrono (uvicorn).
- **OpenAI / Azure OpenAI / Mock** — extractor pluggable según `LLM_PROVIDER`.
- **SQLite (dev)** — persistencia de referencia. En Azure reemplazar por Azure SQL/Postgres.

## Estructura

```
backend/
├── app/
│   ├── main.py          # FastAPI: /v1/intel/scrape, /save, /discard, /healthz
│   ├── runner.py        # Wrapper Scrapy ↔ proceso sync (crochet)
│   ├── extractor.py     # Extractor LLM con providers openai/azure/mock
│   ├── storage.py       # Persistencia + audit log (SQLite ref → Azure SQL prod)
│   ├── models.py        # Schemas Pydantic
│   └── config.py        # Settings vía .env
├── intel_scraper/
│   ├── settings.py
│   ├── items.py
│   └── spiders/generic_spider.py
├── requirements.txt
├── scrapy.cfg
└── .env.example
```

## Correr local

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac
pip install -r requirements.txt
copy .env.example .env          # editar con OPENAI_API_KEY o AZURE_*
uvicorn app.main:app --reload --port 8080
```

Probar:

```bash
curl -X POST http://localhost:8080/v1/intel/scrape \
     -H "Content-Type: application/json" \
     -d '{"url":"https://example.com","prompt":"datos de contacto y razón social","user_id":"jose.poletto"}'
```

## Deploy en Azure

Tres opciones (a definir con integraciones):

| Opción                    | Cuándo conviene                                                    |
|---------------------------|---------------------------------------------------------------------|
| **Azure App Service**     | Más simple. `Dockerfile` o deploy directo desde repo.              |
| **Azure Container Apps**  | Si se quiere autoescalado por requests y aislamiento por tenant.   |
| **Azure Functions Premium** | Si la concurrencia es baja y conviene pay-per-call.              |

> **Azure AI Foundry** se usa para *el modelo* del extractor (poniendo
> `LLM_PROVIDER=azure` y completando `AZURE_OPENAI_*`), no para hostear Scrapy.

Variables a setear en el App Service / Container App:

```
SERVICE_NAME=leiten-intel-scraper
SCRAPING_TIMEOUT_SECONDS=75
LLM_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://<foundry>.openai.azure.com
AZURE_OPENAI_API_KEY=***
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-08-01-preview
SCRAPER_USER_AGENT=LeitenIntelBot/1.0 (+https://leiten.com/contacto)
```

## Logging y auditoría

Cada request escribe un registro en `scrape_audit_log` con: `request_id`, `action`
(`request | response | save | discard | error`), `url`, `prompt`, `user_id`,
`payload_json`, `created_at`. En producción se envía a Application Insights
(ver `docs/azure-endpoint-contract.md`).
