"""
Persistencia de registros guardados y logs de auditoría.

Implementación REFERENCIA usando SQLite local para que el backend corra
end-to-end en dev. En producción Azure se debe reemplazar por:
  - Azure SQL / Postgres (registros estructurados)
  - Azure Storage Table o Application Insights (auditoría/logs)

Ver docs/data-model.md para el esquema final.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)

_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "intel.db"


def _ensure_db() -> None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS scrape_records (
                saved_id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                url TEXT NOT NULL,
                prompt TEXT NOT NULL,
                columns_json TEXT NOT NULL,
                rows_json TEXT NOT NULL,
                user_id TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS scrape_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                action TEXT NOT NULL,        -- request | response | save | discard | error | delete
                url TEXT,
                prompt TEXT,
                user_id TEXT,
                payload_json TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_audit_request ON scrape_audit_log(request_id);
            CREATE INDEX IF NOT EXISTS idx_records_url ON scrape_records(url);
            CREATE INDEX IF NOT EXISTS idx_records_user ON scrape_records(user_id);
            CREATE INDEX IF NOT EXISTS idx_records_created ON scrape_records(created_at);
            """
        )


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


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
            """INSERT INTO scrape_audit_log
               (request_id, action, url, prompt, user_id, payload_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                str(request_id),
                action,
                url,
                prompt,
                user_id,
                json.dumps(payload, ensure_ascii=False) if payload else None,
                datetime.now(timezone.utc).isoformat(),
            ),
        )


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
            """INSERT INTO scrape_records
               (saved_id, request_id, url, prompt, columns_json, rows_json, user_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                str(saved_id),
                str(request_id),
                url,
                prompt,
                json.dumps(columns, ensure_ascii=False),
                json.dumps(rows, ensure_ascii=False),
                user_id,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
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
    params: list[Any] = []

    if user_id:
        conditions.append("user_id = ?")
        params.append(user_id)
    if q:
        conditions.append("(url LIKE ? OR prompt LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with _connect() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS cnt FROM scrape_records {where}", params
        ).fetchone()
        total = total_row["cnt"] if total_row else 0

        rows = conn.execute(
            f"""SELECT saved_id, request_id, url, prompt, rows_json, user_id, created_at
                FROM scrape_records {where}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?""",
            [*params, limit, offset],
        ).fetchall()

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
                "created_at": r["created_at"],
            }
        )

    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_record(saved_id: str) -> dict[str, Any] | None:
    """Devuelve un registro completo o None si no existe."""
    _ensure_db()
    with _connect() as conn:
        row = conn.execute(
            """SELECT saved_id, request_id, url, prompt, columns_json, rows_json, user_id, created_at
               FROM scrape_records WHERE saved_id = ?""",
            (saved_id,),
        ).fetchone()

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
        "created_at": row["created_at"],
    }


def delete_record(saved_id: str, user_id: str | None = None) -> bool:
    """Elimina un registro y deja audit log. Devuelve True si existía."""
    _ensure_db()
    with _connect() as conn:
        existing = conn.execute(
            "SELECT request_id, url, prompt FROM scrape_records WHERE saved_id = ?",
            (saved_id,),
        ).fetchone()

        if not existing:
            return False

        conn.execute("DELETE FROM scrape_records WHERE saved_id = ?", (saved_id,))

    log_audit(
        request_id=existing["request_id"],
        action="delete",
        url=existing["url"],
        prompt=existing["prompt"],
        user_id=user_id,
        payload={"saved_id": saved_id},
    )
    return True
