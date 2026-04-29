# Modelo de datos — Persistencia y auditoría

Esquema propuesto para los registros guardados desde la pantalla de extracción
inteligente. La implementación de referencia (en `backend/app/storage.py`) usa SQLite
para correr local; en producción se reemplaza por **Azure SQL** o **Postgres**.

> **Estado:** PROPUESTA. Pendiente de revisión con DBA / Datos.

---

## Tabla `intel_scrape_records`

Cada fila representa un *guardado* del usuario tras revisar la tabla.

| Columna        | Tipo            | Notas                                                    |
|----------------|-----------------|----------------------------------------------------------|
| `saved_id`     | UUID PK         | ID del registro guardado.                                 |
| `request_id`   | UUID            | Liga a la solicitud original (`/scrape`).                 |
| `url`          | TEXT            | URL analizada.                                            |
| `prompt`       | TEXT            | Instrucción en lenguaje natural del usuario.              |
| `columns_json` | JSONB / NVARCHAR(MAX) | Lista de columnas en el orden mostrado al usuario. |
| `rows_json`    | JSONB / NVARCHAR(MAX) | Filas tal como las confirmó el usuario.            |
| `user_id`      | TEXT            | Quién guardó.                                             |
| `created_at`   | TIMESTAMP       | UTC.                                                      |

Índices:
- `idx_records_url` sobre `url` (búsqueda posterior).
- `idx_records_user` sobre `user_id` (mis guardados).
- `idx_records_created` sobre `created_at DESC` (listados recientes).

### ¿Por qué guardar las filas como JSON y no normalizadas?

- Las **columnas son dinámicas** (las decide el LLM por página). No tiene sentido
  forzar un schema fijo en una primera iteración.
- Para reportes posteriores se pueden **proyectar** campos comunes (razón social,
  CUIT) a una **vista materializada** o tabla aparte (`intel_companies`) cuando
  consolidemos los campos canónicos.

### Camino de evolución (segunda iteración)

Cuando estabilicemos los campos canónicos, agregar:

```sql
CREATE TABLE intel_companies (
  company_id   UUID PRIMARY KEY,
  saved_id     UUID REFERENCES intel_scrape_records(saved_id),
  razon_social TEXT,
  cuit         TEXT,
  domicilio    TEXT,
  telefono     TEXT,
  email        TEXT,
  web          TEXT,
  rubro        TEXT,
  source_url   TEXT,
  created_at   TIMESTAMP
);
```

con un proceso async que extrae filas comunes desde `intel_scrape_records.rows_json`
hacia esta tabla normalizada.

---

## Tabla `intel_scrape_audit_log`

Log de auditoría — cada acción del usuario o evento del sistema queda registrado.

| Columna        | Tipo       | Notas                                                          |
|----------------|------------|----------------------------------------------------------------|
| `id`           | BIGSERIAL  | PK incremental.                                                 |
| `request_id`   | UUID       | Liga a la solicitud `/scrape`.                                  |
| `action`       | TEXT       | `request \| response \| save \| discard \| error`.              |
| `url`          | TEXT       |                                                                |
| `prompt`       | TEXT       |                                                                |
| `user_id`      | TEXT       |                                                                |
| `payload_json` | JSONB      | Datos del evento (rows count, elapsed_ms, error message, etc). |
| `created_at`   | TIMESTAMP  | UTC.                                                            |

Índices: `idx_audit_request` sobre `request_id`, `idx_audit_user_date` sobre `(user_id, created_at DESC)`.

### Política de retención

- Sugerencia inicial: **365 días** en hot storage, luego export a Blob Storage.
- En Azure se puede mover a **Application Insights** y dejar acá solo los `save/discard`.

---

## Modelo en Azure SQL (DDL sugerido)

```sql
CREATE TABLE intel_scrape_records (
  saved_id      UNIQUEIDENTIFIER PRIMARY KEY,
  request_id    UNIQUEIDENTIFIER NOT NULL,
  url           NVARCHAR(2048)   NOT NULL,
  prompt        NVARCHAR(MAX)    NOT NULL,
  columns_json  NVARCHAR(MAX)    NOT NULL,
  rows_json     NVARCHAR(MAX)    NOT NULL,
  user_id       NVARCHAR(128)    NULL,
  created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX idx_records_url     ON intel_scrape_records(url);
CREATE INDEX idx_records_user    ON intel_scrape_records(user_id);
CREATE INDEX idx_records_created ON intel_scrape_records(created_at DESC);

CREATE TABLE intel_scrape_audit_log (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  request_id    UNIQUEIDENTIFIER NOT NULL,
  action        NVARCHAR(32)     NOT NULL,
  url           NVARCHAR(2048)   NULL,
  prompt        NVARCHAR(MAX)    NULL,
  user_id       NVARCHAR(128)    NULL,
  payload_json  NVARCHAR(MAX)    NULL,
  created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX idx_audit_request   ON intel_scrape_audit_log(request_id);
CREATE INDEX idx_audit_user_date ON intel_scrape_audit_log(user_id, created_at DESC);
```
