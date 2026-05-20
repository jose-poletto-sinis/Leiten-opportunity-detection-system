# Proyecto Scrapy — Búsqueda inteligente de oportunidades

Sistema de extracción de información de páginas web públicas para identificar oportunidades de
negocio sobre **empresas, obras y desarrolladoras**. Pensado para usuarios del área comercial
(vendedores, asistentes, marketing) que hoy hacen este trabajo manualmente.

## Componentes

| Carpeta     | Qué contiene                                                                                 |
|-------------|-----------------------------------------------------------------------------------------------|
| `backend/`  | Servicio Python (Scrapy + FastAPI + extractor LLM). Es el código que se despliega en Azure.  |
| `frontend/` | Pantalla nueva en Next.js (App Router) que consume el endpoint de Azure.                     |
| `docs/`     | Contrato del endpoint, modelo de datos de persistencia, esquema de logs, criterios de aceptación. |

## Flujo de alto nivel

```
[Usuario] -> [Pantalla Next.js] --POST--> [Endpoint Azure (FastAPI)]
                                                  |
                                                  +-- Scrapy descarga la URL
                                                  +-- Extractor LLM aplica el prompt
                                                  +-- Devuelve filas estructuradas
                                                  v
[Pantalla] <-- tabla dinámica <-- [respuesta JSON]
   |
   +-- Guardar -> persistir en BD (auditoría + registros)
   +-- Descartar -> no se guarda nada
```

## Arranque rápido

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

### Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:3000/intel
```

Ver `docs/azure-endpoint-contract.md` para el contrato del endpoint y los TODOs pendientes
con el área de integraciones.

## URLs de producción

| Servicio | URL |
|---|---|
| Frontend | https://red-dune-08f3c890f.7.azurestaticapps.net |
| Backend principal | https://leiten-intel-scraper.azurewebsites.net |
| Backend de respaldo | https://leiten-opportunity-api.azurewebsites.net |

### Activar el respaldo si el backend principal cae

1. Verificar que el principal no responde: `GET /healthz` devuelve error.
2. Rebuildar el frontend con la URL del respaldo:
   ```bash
   cd frontend
   NEXT_PUBLIC_INTEL_API_URL=https://leiten-opportunity-api.azurewebsites.net npm run build
   ```
3. Redeployar al Static Web App `leiten-intel-frontend`.

Ambos backends corren el mismo contenedor Docker (`leitenregistry.azurecr.io/leiten-opportunity-api:latest`) con las mismas variables de entorno.
