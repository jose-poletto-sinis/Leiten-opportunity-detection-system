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
