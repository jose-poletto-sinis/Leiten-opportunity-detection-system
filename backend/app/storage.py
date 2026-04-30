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
                created_at TEXT NOT NULL
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
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_request ON scrape_audit_log(request_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_records_url ON scrape_records(url)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_records_user ON scrape_records(user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_records_created ON scrape_records(created_at)"))
        conn.commit()

    # Migración: agregar columna status si no existe (para DBs existentes)
    with engine.connect() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text(
                "ALTER TABLE scrape_records ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendiente'"
            ))
        else:
            try:
                conn.execute(text(
                    "ALTER TABLE scrape_records ADD COLUMN status TEXT NOT NULL DEFAULT 'pendiente'"
                ))
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
) -> UUID:
    _ensure_db()
    saved_id = uuid4()
    with _connect() as conn:
        conn.execute(
            text("""INSERT INTO scrape_records
                    (saved_id, request_id, url, prompt, columns_json, rows_json, user_id, status, created_at)
                    VALUES (:saved_id, :request_id, :url, :prompt, :columns_json, :rows_json,
                            :user_id, :status, :created_at)"""),
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

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with _connect() as conn:
        total_row = conn.execute(
            text(f"SELECT COUNT(*) AS cnt FROM scrape_records {where}"), params
        ).mappings().fetchone()
        total = total_row["cnt"] if total_row else 0

        rows = conn.execute(
            text(f"""SELECT saved_id, request_id, url, prompt, rows_json, user_id, status, created_at
                     FROM scrape_records {where}
                     ORDER BY created_at DESC
                     LIMIT :limit OFFSET :offset"""),
            {**params, "limit": limit, "offset": offset},
        ).mappings().fetchall()

    items = []
    for r in rows:
        try:
            row_count = len(json.loads(r["rows_json"]))
        except Exception:
            row_count = 0
        items.append(
            {
                "saved_id": r["saved_id"],
                "request_id": r["request_id"],
                "url": r["url"],
                "prompt": r["prompt"],
                "row_count": row_count,
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
