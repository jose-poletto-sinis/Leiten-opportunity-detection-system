"""
Persistencia de registros guardados y logs de auditoría.

Usa SQLAlchemy Core para soportar dos backends:
  - SQLite  (desarrollo local — sin configuración extra)
  - PostgreSQL (producción en Azure — setear DATABASE_URL)

Si DATABASE_URL está vacío o no definido, cae a SQLite local en backend/data/intel.db.
"""
from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator
from uuid import UUID, uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from .config import get_settings

logger = logging.getLogger(__name__)

_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "intel.db"


@lru_cache(maxsize=1)
def _get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        url = f"sqlite:///{_DB_PATH}"
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, pool_pre_ping=True, connect_args=connect_args)


@contextmanager
def _connect() -> Iterator[Connection]:
    with _get_engine().connect() as conn:
        yield conn


def _ensure_db() -> None:
    engine = _get_engine()
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS scrape_records (
                saved_id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                url TEXT NOT NULL,
                prompt TEXT NOT NULL,
                columns_json TEXT NOT NULL,
                rows_json TEXT NOT NULL,
                user_id TEXT,
                status TEXT NOT NULL DEFAULT 'pendiente',
                created_at TEXT NOT NULL,
                registered_id TEXT,
                nombre TEXT,
                frecuencia TEXT,
                fecha_inicio TEXT,
                fecha_fin TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS scrape_audit_log (
                id SERIAL PRIMARY KEY,
                request_id TEXT NOT NULL,
                action TEXT NOT NULL,
                url TEXT,
                prompt TEXT,
                user_id TEXT,
                payload_json TEXT,
                created_at TEXT NOT NULL
            )
        """ if engine.dialect.name == "postgresql" else """
            CREATE TABLE IF NOT EXISTS scrape_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                action TEXT NOT NULL,
                url TEXT,
                prompt TEXT,
                user_id TEXT,
                payload_json TEXT,
                created_at TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS registered_urls (
                id TEXT PRIMARY KEY,
                nombre TEXT,
                url TEXT NOT NULL,
                cargado_por TEXT,
                frecuencia TEXT NOT NULL DEFAULT 'semanal',
                prompt TEXT,
                fecha_inicio TEXT,
                fecha_fin TEXT,
                fecha_ultimo_scraping TEXT,
                created_at TEXT NOT NULL,
                frecuencia_baja INTEGER NOT NULL DEFAULT 0
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                cod_usr TEXT NOT NULL,
                nom_usr TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS enrichment_processes (
                id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                descripcion TEXT,
                entrada TEXT NOT NULL,
                activo INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_request ON scrape_audit_log(request_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_records_url ON scrape_records(url)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_records_user ON scrape_records(user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_records_created ON scrape_records(created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reg_urls_created ON registered_urls(created_at)"))
        conn.commit()

    # Migraciones para DBs existentes
    with engine.connect() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text(
                "ALTER TABLE scrape_records ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendiente'"
            ))
            conn.execute(text("ALTER TABLE scrape_records ADD COLUMN IF NOT EXISTS registered_id TEXT"))
            conn.execute(text("ALTER TABLE scrape_records ADD COLUMN IF NOT EXISTS nombre TEXT"))
            conn.execute(text("ALTER TABLE scrape_records ADD COLUMN IF NOT EXISTS frecuencia TEXT"))
            conn.execute(text("ALTER TABLE scrape_records ADD COLUMN IF NOT EXISTS fecha_inicio TEXT"))
            conn.execute(text("ALTER TABLE scrape_records ADD COLUMN IF NOT EXISTS fecha_fin TEXT"))
            conn.execute(text("ALTER TABLE registered_urls ADD COLUMN IF NOT EXISTS nombre TEXT"))
            conn.execute(text("ALTER TABLE registered_urls ADD COLUMN IF NOT EXISTS prompt TEXT"))
            conn.execute(text("ALTER TABLE registered_urls ADD COLUMN IF NOT EXISTS fecha_inicio TEXT"))
            conn.execute(text("ALTER TABLE registered_urls ADD COLUMN IF NOT EXISTS fecha_fin TEXT"))
            conn.execute(text("ALTER TABLE registered_urls ADD COLUMN IF NOT EXISTS frecuencia_baja INTEGER NOT NULL DEFAULT 0"))
            # Migrar enrichment_processes al nuevo schema (drop columnas tipo/endpoint si existen)
            conn.execute(text("ALTER TABLE enrichment_processes DROP COLUMN IF EXISTS tipo"))
            conn.execute(text("ALTER TABLE enrichment_processes DROP COLUMN IF EXISTS endpoint"))
            conn.execute(text("ALTER TABLE enrichment_processes ADD COLUMN IF NOT EXISTS entrada TEXT NOT NULL DEFAULT ''"))
        else:
            for stmt in [
                "ALTER TABLE scrape_records ADD COLUMN status TEXT NOT NULL DEFAULT 'pendiente'",
                "ALTER TABLE scrape_records ADD COLUMN registered_id TEXT",
                "ALTER TABLE scrape_records ADD COLUMN nombre TEXT",
                "ALTER TABLE scrape_records ADD COLUMN frecuencia TEXT",
                "ALTER TABLE scrape_records ADD COLUMN fecha_inicio TEXT",
                "ALTER TABLE scrape_records ADD COLUMN fecha_fin TEXT",
                "ALTER TABLE registered_urls ADD COLUMN nombre TEXT",
                "ALTER TABLE registered_urls ADD COLUMN prompt TEXT",
                "ALTER TABLE registered_urls ADD COLUMN fecha_inicio TEXT",
                "ALTER TABLE registered_urls ADD COLUMN fecha_fin TEXT",
                "ALTER TABLE registered_urls ADD COLUMN frecuencia_baja INTEGER NOT NULL DEFAULT 0",
            ]:
                try:
                    conn.execute(text(stmt))
                except Exception:
                    pass
        conn.commit()


def log_audit(
    *,
    request_id: UUID | str,
    action: str,
    url: str | None = None,
    prompt: str | None = None,
    user_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    _ensure_db()
    with _connect() as conn:
        conn.execute(
            text("""INSERT INTO scrape_audit_log
                    (request_id, action, url, prompt, user_id, payload_json, created_at)
                    VALUES (:request_id, :action, :url, :prompt, :user_id, :payload_json, :created_at)"""),
            {
                "request_id": str(request_id),
                "action": action,
                "url": url,
                "prompt": prompt,
                "user_id": user_id,
                "payload_json": json.dumps(payload, ensure_ascii=False) if payload else None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        conn.commit()


def save_record(
    *,
    request_id: UUID | str,
    url: str,
    prompt: str,
    columns: list[str],
    rows: list[dict[str, Any]],
    user_id: str | None,
    registered_id: str | None = None,
    nombre: str | None = None,
    frecuencia: str | None = None,
    fecha_inicio: str | None = None,
    fecha_fin: str | None = None,
) -> UUID:
    _ensure_db()
    saved_id = uuid4()
    with _connect() as conn:
        conn.execute(
            text("""INSERT INTO scrape_records
                    (saved_id, request_id, url, prompt, columns_json, rows_json, user_id, status, created_at,
                     registered_id, nombre, frecuencia, fecha_inicio, fecha_fin)
                    VALUES (:saved_id, :request_id, :url, :prompt, :columns_json, :rows_json,
                            :user_id, :status, :created_at,
                            :registered_id, :nombre, :frecuencia, :fecha_inicio, :fecha_fin)"""),
            {
                "saved_id": str(saved_id),
                "request_id": str(request_id),
                "url": url,
                "prompt": prompt,
                "columns_json": json.dumps(columns, ensure_ascii=False),
                "rows_json": json.dumps(rows, ensure_ascii=False),
                "user_id": user_id,
                "status": "pendiente",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "registered_id": registered_id,
                "nombre": nombre,
                "frecuencia": frecuencia,
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
            },
        )
        conn.commit()
    log_audit(
        request_id=request_id,
        action="save",
        url=url,
        prompt=prompt,
        user_id=user_id,
        payload={"saved_id": str(saved_id), "rows": len(rows)},
    )
    return saved_id


def list_records(
    *,
    limit: int = 50,
    offset: int = 0,
    user_id: str | None = None,
    q: str | None = None,
    registered_id: str | None = None,
) -> dict[str, Any]:
    """Devuelve registros paginados ordenados por created_at DESC."""
    _ensure_db()
    conditions: list[str] = []
    params: dict[str, Any] = {}

    if user_id:
        conditions.append("user_id = :user_id")
        params["user_id"] = user_id
    if q:
        conditions.append("(url LIKE :q OR prompt LIKE :q)")
        params["q"] = f"%{q}%"
    if registered_id:
        conditions.append("registered_id = :registered_id")
        params["registered_id"] = registered_id

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with _connect() as conn:
        total_row = conn.execute(
            text(f"SELECT COUNT(*) AS cnt FROM scrape_records {where}"), params
        ).mappings().fetchone()
        total = total_row["cnt"] if total_row else 0

        rows = conn.execute(
            text(f"""SELECT saved_id, request_id, url, prompt, rows_json, columns_json, user_id, status, created_at
                     FROM scrape_records {where}
                     ORDER BY created_at DESC
                     LIMIT :limit OFFSET :offset"""),
            {**params, "limit": limit, "offset": offset},
        ).mappings().fetchall()

    items = []
    for r in rows:
        try:
            parsed_rows = json.loads(r["rows_json"])
            row_count = len(parsed_rows)
            rows_preview = json.dumps(parsed_rows[:2], ensure_ascii=False, indent=2)
        except Exception:
            row_count = 0
            rows_preview = ""
        items.append(
            {
                "saved_id": r["saved_id"],
                "request_id": r["request_id"],
                "url": r["url"],
                "prompt": r["prompt"],
                "row_count": row_count,
                "rows_preview": rows_preview,
                "user_id": r["user_id"],
                "status": r["status"],
                "created_at": r["created_at"],
            }
        )

    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_record(saved_id: str) -> dict[str, Any] | None:
    """Devuelve un registro completo o None si no existe."""
    _ensure_db()
    with _connect() as conn:
        row = conn.execute(
            text("""SELECT saved_id, request_id, url, prompt, columns_json, rows_json,
                           user_id, status, created_at
                    FROM scrape_records WHERE saved_id = :id"""),
            {"id": saved_id},
        ).mappings().fetchone()

    if not row:
        return None

    return {
        "saved_id": row["saved_id"],
        "request_id": row["request_id"],
        "url": row["url"],
        "prompt": row["prompt"],
        "columns": json.loads(row["columns_json"]),
        "rows": json.loads(row["rows_json"]),
        "user_id": row["user_id"],
        "status": row["status"],
        "created_at": row["created_at"],
    }


# ─── URLs registradas ────────────────────────────────────────────────────────

def register_url(
    *,
    url: str,
    nombre: str | None = None,
    cargado_por: str | None,
    frecuencia: str = "semanal",
    prompt: str | None = None,
    fecha_inicio: str | None = None,
    fecha_fin: str | None = None,
) -> str:
    _ensure_db()
    new_id = str(uuid4())
    with _connect() as conn:
        conn.execute(
            text("""INSERT INTO registered_urls
                    (id, nombre, url, cargado_por, frecuencia, prompt, fecha_inicio, fecha_fin, created_at)
                    VALUES (:id, :nombre, :url, :cargado_por, :frecuencia, :prompt, :fecha_inicio, :fecha_fin, :created_at)"""),
            {
                "id": new_id,
                "nombre": nombre,
                "url": url,
                "cargado_por": cargado_por,
                "frecuencia": frecuencia,
                "prompt": prompt,
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        conn.commit()
    return new_id


def list_registered_urls() -> list[dict[str, Any]]:
    _ensure_db()
    with _connect() as conn:
        rows = conn.execute(
            text("SELECT id, nombre, url, cargado_por, frecuencia, prompt, fecha_inicio, fecha_fin, "
                 "fecha_ultimo_scraping, created_at "
                 "FROM registered_urls WHERE frecuencia_baja = 0 ORDER BY created_at DESC")
        ).mappings().fetchall()
    return [dict(r) for r in rows]


def update_registered_url(
    registered_id: str,
    *,
    nombre: str | None = None,
    url: str | None = None,
    frecuencia: str | None = None,
    prompt: str | None = None,
    fecha_inicio: str | None = None,
    fecha_fin: str | None = None,
) -> bool:
    _ensure_db()
    fields: list[str] = []
    params: dict[str, Any] = {"id": registered_id}
    if nombre is not None:
        fields.append("nombre = :nombre")
        params["nombre"] = nombre
    if url is not None:
        fields.append("url = :url")
        params["url"] = url
    if frecuencia is not None:
        fields.append("frecuencia = :frecuencia")
        params["frecuencia"] = frecuencia
    if prompt is not None:
        fields.append("prompt = :prompt")
        params["prompt"] = prompt
    if fecha_inicio is not None:
        fields.append("fecha_inicio = :fecha_inicio")
        params["fecha_inicio"] = fecha_inicio
    if fecha_fin is not None:
        fields.append("fecha_fin = :fecha_fin")
        params["fecha_fin"] = fecha_fin
    if not fields:
        return True
    with _connect() as conn:
        result = conn.execute(
            text(f"UPDATE registered_urls SET {', '.join(fields)} WHERE id = :id"),
            params,
        )
        conn.commit()
    return result.rowcount > 0


def mark_url_scraped(registered_id: str) -> None:
    _ensure_db()
    with _connect() as conn:
        conn.execute(
            text("UPDATE registered_urls SET fecha_ultimo_scraping = :ts WHERE id = :id"),
            {"ts": datetime.now(timezone.utc).isoformat(), "id": registered_id},
        )
        conn.commit()


def delete_registered_url(registered_id: str) -> bool:
    _ensure_db()
    with _connect() as conn:
        result = conn.execute(
            text("UPDATE registered_urls SET frecuencia_baja = 1 WHERE id = :id AND frecuencia_baja = 0"),
            {"id": registered_id},
        )
        conn.commit()
    return result.rowcount > 0


def get_urls_due_for_scraping() -> list[dict[str, Any]]:
    """Devuelve las URLs que ya cumplieron su intervalo de frecuencia."""
    from datetime import timedelta
    _ensure_db()
    now = datetime.now(timezone.utc)
    intervals = {"diaria": timedelta(hours=23), "semanal": timedelta(days=6, hours=12), "mensual": timedelta(days=29)}
    with _connect() as conn:
        rows = conn.execute(
            text("SELECT id, url, cargado_por, frecuencia, fecha_ultimo_scraping "
                 "FROM registered_urls WHERE frecuencia_baja = 0")
        ).mappings().fetchall()
    due = []
    for r in rows:
        interval = intervals.get(r["frecuencia"], intervals["semanal"])
        last = r["fecha_ultimo_scraping"]
        if last is None:
            due.append(dict(r))
        else:
            try:
                last_dt = datetime.fromisoformat(last)
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                if now - last_dt >= interval:
                    due.append(dict(r))
            except ValueError:
                due.append(dict(r))
    return due


# ─── Configuración del sistema ───────────────────────────────────────────────

_DEFAULT_PROMPT = (
    "Extraé información estructurada sobre EMPRESAS, OBRAS y DESARROLLADORAS: "
    "razón social, CUIT, domicilio, teléfono, email, web, referente, obras en curso, rubro."
)


def get_system_config(key: str) -> str | None:
    _ensure_db()
    with _connect() as conn:
        row = conn.execute(
            text("SELECT value FROM system_config WHERE key = :key"),
            {"key": key},
        ).mappings().fetchone()
    return row["value"] if row else None


def set_system_config(key: str, value: str) -> None:
    _ensure_db()
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        if _get_engine().dialect.name == "postgresql":
            conn.execute(
                text("""INSERT INTO system_config (key, value, updated_at)
                        VALUES (:key, :value, :updated_at)
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at"""),
                {"key": key, "value": value, "updated_at": now},
            )
        else:
            conn.execute(
                text("INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (:key, :value, :updated_at)"),
                {"key": key, "value": value, "updated_at": now},
            )
        conn.commit()


def get_active_prompt() -> str:
    return get_system_config("prompt") or _DEFAULT_PROMPT


# ─── Sesiones ────────────────────────────────────────────────────────────────

def create_session(session_id: str, cod_usr: str, nom_usr: str, expires_in_minutes: int) -> None:
    _ensure_db()
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(minutes=expires_in_minutes)).isoformat()
    with _connect() as conn:
        if _get_engine().dialect.name == "postgresql":
            conn.execute(
                text("""INSERT INTO sessions (session_id, cod_usr, nom_usr, created_at, expires_at)
                        VALUES (:sid, :cod, :nom, :created, :expires)
                        ON CONFLICT (session_id) DO UPDATE SET expires_at = EXCLUDED.expires_at"""),
                {"sid": session_id, "cod": cod_usr, "nom": nom_usr,
                 "created": now.isoformat(), "expires": expires_at},
            )
        else:
            conn.execute(
                text("""INSERT OR REPLACE INTO sessions (session_id, cod_usr, nom_usr, created_at, expires_at)
                        VALUES (:sid, :cod, :nom, :created, :expires)"""),
                {"sid": session_id, "cod": cod_usr, "nom": nom_usr,
                 "created": now.isoformat(), "expires": expires_at},
            )
        conn.commit()


def get_session(session_id: str) -> dict[str, Any] | None:
    _ensure_db()
    with _connect() as conn:
        row = conn.execute(
            text("SELECT session_id, cod_usr, nom_usr, expires_at FROM sessions WHERE session_id = :sid"),
            {"sid": session_id},
        ).mappings().fetchone()
    if not row:
        return None
    try:
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            delete_session(session_id)
            return None
    except ValueError:
        return None
    return {"session_id": row["session_id"], "cod_usr": row["cod_usr"], "nom_usr": row["nom_usr"]}


def delete_session(session_id: str) -> None:
    _ensure_db()
    with _connect() as conn:
        conn.execute(text("DELETE FROM sessions WHERE session_id = :sid"), {"sid": session_id})
        conn.commit()


# ─────────────────────────────────────────────────────────────────────────────

def delete_record(saved_id: str, user_id: str | None = None) -> bool:
    """Elimina un registro y deja audit log. Devuelve True si existía."""
    _ensure_db()
    with _connect() as conn:
        existing = conn.execute(
            text("SELECT request_id, url, prompt FROM scrape_records WHERE saved_id = :id"),
            {"id": saved_id},
        ).mappings().fetchone()

        if not existing:
            return False

        conn.execute(
            text("DELETE FROM scrape_records WHERE saved_id = :id"),
            {"id": saved_id},
        )
        conn.commit()

    log_audit(
        request_id=existing["request_id"],
        action="delete",
        url=existing["url"],
        prompt=existing["prompt"],
        user_id=user_id,
        payload={"saved_id": saved_id},
    )
    return True


# ─── Procesos de enriquecimiento ─────────────────────────────────────────────

_ENRICHMENT_SEED = [
    {
        "id": "buscar_datos_por_cuit",
        "nombre": "Buscar datos a través de CUIT",
        "descripcion": "Consulta AFIP para obtener razón social, estado, actividad principal y domicilio fiscal.",
        "entrada": "cuit",
    },
    {
        "id": "buscar_obras_por_localizacion",
        "nombre": "Buscar obras a través de localización",
        "descripcion": "Detecta obras en construcción dentro de un radio geográfico a partir de coordenadas.",
        "entrada": "localizacion",
    },
    {
        "id": "buscar_empresa_por_nombre",
        "nombre": "Buscar empresa por razón social",
        "descripcion": "Busca una empresa en Google Maps por nombre y devuelve dirección, teléfono, web y categorías.",
        "entrada": "razon_social",
    },
    {
        "id": "validar_email",
        "nombre": "Validar email",
        "descripcion": "Verifica si una dirección de email es válida y está activa.",
        "entrada": "email",
    },
    {
        "id": "verificar_sitio_web",
        "nombre": "Verificar sitio web activo",
        "descripcion": "Comprueba si un sitio web responde y está en línea.",
        "entrada": "sitio_web",
    },
]


def _seed_enrichment_processes(conn: Any) -> None:
    now = datetime.now(timezone.utc).isoformat()
    is_pg = _get_engine().dialect.name == "postgresql"
    for p in _ENRICHMENT_SEED:
        conn.execute(
            text("""INSERT INTO enrichment_processes (id, nombre, descripcion, entrada, activo, created_at)
                    VALUES (:id, :nombre, :descripcion, :entrada, 1, :created_at)
                    ON CONFLICT (id) DO NOTHING""")
            if is_pg
            else text("""INSERT OR IGNORE INTO enrichment_processes (id, nombre, descripcion, entrada, activo, created_at)
                    VALUES (:id, :nombre, :descripcion, :entrada, 1, :created_at)"""),
            {**p, "created_at": now},
        )


def list_enrichment_processes(only_active: bool = False) -> list[dict[str, Any]]:
    _ensure_db()
    with _connect() as conn:
        _seed_enrichment_processes(conn)
        conn.commit()
        where = "WHERE activo = 1" if only_active else ""
        rows = conn.execute(
            text(f"SELECT id, nombre, descripcion, entrada, activo, created_at FROM enrichment_processes {where} ORDER BY created_at ASC")
        ).mappings().fetchall()
    return [dict(r) for r in rows]


def toggle_enrichment_process(process_id: str, activo: bool) -> bool:
    _ensure_db()
    with _connect() as conn:
        result = conn.execute(
            text("UPDATE enrichment_processes SET activo = :activo WHERE id = :id"),
            {"activo": 1 if activo else 0, "id": process_id},
        )
        conn.commit()
    return result.rowcount > 0
