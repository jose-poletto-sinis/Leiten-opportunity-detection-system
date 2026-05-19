"""
Búsqueda de emails por dominio usando Hunter.io API.

Dado un dominio, devuelve emails encontrados con score de confianza.
Requiere HUNTER_API_KEY (free tier: 25 búsquedas/mes).
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

HUNTER_DOMAIN_SEARCH = "https://api.hunter.io/v2/domain-search"


def search_emails_by_domain(domain: str, api_key: str, limit: int = 10) -> dict[str, Any]:
    """
    Busca emails asociados a un dominio en Hunter.io.

    Returns:
        dict con lista de emails y metadata, o {"found": False} si no hay resultados
    """
    if not api_key:
        raise ValueError("HUNTER_API_KEY no configurada.")

    domain = domain.replace("https://", "").replace("http://", "").split("/")[0]

    params = {
        "domain": domain,
        "api_key": api_key,
        "limit": min(limit, 10),
    }

    with httpx.Client(timeout=10) as client:
        resp = client.get(HUNTER_DOMAIN_SEARCH, params=params)
        resp.raise_for_status()
        data = resp.json()

    payload = data.get("data") or {}
    emails_raw = payload.get("emails") or []

    if not emails_raw and not payload.get("organization"):
        return {"found": False, "domain": domain}

    emails = [
        {
            "email": e.get("value"),
            "tipo": e.get("type"),          # personal | generic
            "confianza": e.get("confidence"),
            "nombre": e.get("first_name"),
            "apellido": e.get("last_name"),
            "cargo": e.get("position"),
            "linkedin": e.get("linkedin"),
            "verificado": e.get("verification", {}).get("status") == "valid" if e.get("verification") else None,
        }
        for e in emails_raw
    ]

    return {
        "found": len(emails) > 0,
        "domain": domain,
        "organizacion": payload.get("organization"),
        "total_emails": payload.get("total") or len(emails),
        "emails": emails,
        "patron_email": payload.get("pattern"),   # ej: "{first}.{last}"
    }
