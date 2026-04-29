# Frontend — Pantalla de extracción inteligente

Pantalla nueva en Next.js (App Router) que se monta en `/intel`. Consume el endpoint
de Azure (FastAPI) descripto en `docs/azure-endpoint-contract.md`.

## Arrancar local

```bash
npm install
copy .env.example .env.local
# Asegurate de que NEXT_PUBLIC_INTEL_API_URL apunte al backend
npm run dev
```

Abrir http://localhost:3000/intel

## Estructura

```
frontend/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx               # Home: link a /intel
│   └── intel/page.tsx         # Pantalla principal (formulario + tabla)
├── components/
│   ├── ScrapeForm.tsx         # URL + prompt + validaciones
│   └── ResultsTable.tsx       # Tabla dinámica con scroll horizontal
├── lib/
│   ├── api.ts                 # Cliente HTTP del backend
│   ├── types.ts               # Tipos compartidos con el contrato Azure
│   └── validators.ts          # Validación de URL y prompt
└── package.json
```

## Cómo se integra a la app existente

La pantalla está pensada para portarse a la app principal de Leiten. Tres caminos:

1. **Copiar la ruta `app/intel/`** + `components/` + `lib/` al monorepo, ajustando aliases.
2. **Publicar como package** (`@leiten/intel-scraper-ui`) y consumirlo desde la app.
3. **Iframe** apuntando a este Next.js si se prefiere aislar el deploy.

La opción 1 es la más rápida y la sugerida si ya hay un Next.js corriendo.
