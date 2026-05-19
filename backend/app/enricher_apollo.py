"""
Enriquecimiento de datos usando Apollo.io API.

- enrich_org: dado un dominio o nombre de empresa, devuelve datos firmográficos.
- search_people: dado un dominio o nombre de empresa, devuelve contactos clave.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

APOLLO_BASE = "https://api.apollo.io/v1"
ORG_ENRICH_URL    = f"{APOLLO_BASE}/organizations/enrich"
PEOPLE_SEARCH_URL = f"{APOLLO_BASE}/mixed_people/api_search"
PEOPLE_MATCH_URL  = f"{APOLLO_BASE}/people/match"


def enrich_org(domain: str, api_key: str) -> dict[str, Any]:
    """
    Enriquece datos de una empresa por dominio web.

    Args:
        domain: dominio de la empresa (ej: "acme.com" o "www.acme.com")
        api_key: Apollo API key

    Returns:
        dict con datos de la organización, o {"found": False} si no hay resultados
    """
    if not api_key:
        raise ValueError("APOLLO_API_KEY no configurada.")

    domain = domain.replace("https://", "").replace("http://", "").split("/")[0]

    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": api_key,
    }

    with httpx.Client(timeout=15) as client:
        resp = client.get(ORG_ENRICH_URL, params={"domain": domain}, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    org = data.get("organization")
    if not org:
        return {"found": False, "domain": domain}

    return {
        "found": True,
        "domain": domain,
        "nombre": org.get("name"),
        "sitio_web": org.get("website_url"),
        "linkedin_url": org.get("linkedin_url"),
        "twitter_url": org.get("twitter_url"),
        "facebook_url": org.get("facebook_url"),
        "telefono": org.get("phone"),
        "industria": org.get("industry"),
        "sub_industria": org.get("sub_industry"),
        "empleados": org.get("estimated_num_employees"),
        "rango_empleados": org.get("employee_count_range"),
        "pais": org.get("country"),
        "estado_provincia": org.get("state"),
        "ciudad": org.get("city"),
        "descripcion": org.get("short_description"),
        "tecnologias": [t.get("name") for t in (org.get("technologies") or []) if t.get("name")],
        "palabras_clave": org.get("keywords") or [],
        "ingresos_anuales": org.get("annual_revenue"),
        "rango_ingresos": org.get("annual_revenue_printed"),
        "fundacion": org.get("founded_year"),
        "apollo_id": org.get("id"),
    }


def search_people(
    api_key: str,
    domain: str | None = None,
    org_name: str | None = None,
    titulos: list[str] | None = None,
    pagina: int = 1,
    por_pagina: int = 10,
) -> dict[str, Any]:
    """
    Busca contactos (personas) en una empresa.

    Args:
        api_key: Apollo API key
        domain: dominio de la empresa (preferido)
        org_name: nombre de la empresa (alternativa si no hay dominio)
        titulos: lista de títulos/cargos a filtrar (ej: ["CEO", "CTO", "Director"])
        pagina: número de página
        por_pagina: resultados por página (máx 25 en plan free)

    Returns:
        dict con lista de contactos y metadata de paginación
    """
    if not api_key:
        raise ValueError("APOLLO_API_KEY no configurada.")

    if not domain and not org_name:
        raise ValueError("Se requiere domain u org_name.")

    payload: dict[str, Any] = {
        "page": pagina,
        "per_page": min(por_pagina, 25),
    }

    if domain:
        domain = domain.replace("https://", "").replace("http://", "").split("/")[0]
        payload["q_organization_domains"] = domain

    if org_name:
        payload["q_keywords"] = org_name

    if titulos:
        payload["person_titles"] = titulos

    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": api_key,
    }

    with httpx.Client(timeout=15) as client:
        resp = client.post(PEOPLE_SEARCH_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    personas = data.get("people") or data.get("contacts") or []
    total = data.get("total_entries") or len(personas)

    contactos = []
    for p in personas:
        org = p.get("organization") or {}
        primer_nombre = p.get("first_name") or ""
        # El plan free devuelve last_name_obfuscated (ej: "Na***a")
        apellido = p.get("last_name") or p.get("last_name_obfuscated") or ""
        nombre_completo = f"{primer_nombre} {apellido}".strip() or None
        contactos.append({
            "nombre": nombre_completo,
            "primer_nombre": primer_nombre or None,
            "apellido": apellido or None,
            "titulo": p.get("title"),
            "email": p.get("email"),
            "email_estado": p.get("email_status"),
            "linkedin_url": p.get("linkedin_url"),
            "telefono": p.get("phone_numbers", [{}])[0].get("raw_number") if p.get("phone_numbers") else None,
            "ciudad": p.get("city"),
            "estado_provincia": p.get("state"),
            "pais": p.get("country"),
            "empresa": org.get("name"),
            "empresa_dominio": org.get("website_url"),
            "apollo_id": p.get("id"),
        })

    return {
        "found": len(contactos) > 0,
        "total": total,
        "pagina": pagina,
        "por_pagina": por_pagina,
        "contactos": contactos,
    }


def reveal_contact(apollo_id: str, api_key: str) -> dict[str, Any]:
    """
    Revela datos completos de un contacto usando 1 crédito Apollo.
    Desbloquea apellido completo, email y teléfono.
    """
    if not api_key:
        raise ValueError("APOLLO_API_KEY no configurada.")

    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": api_key,
    }
    payload = {
        "id": apollo_id,
        "reveal_personal_emails": True,
    }

    with httpx.Client(timeout=15) as client:
        resp = client.post(PEOPLE_MATCH_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    p = data.get("person") or {}
    if not p:
        return {"found": False, "apollo_id": apollo_id}

    # Recolectar todos los emails disponibles
    emails_list = []
    if p.get("email"):
        emails_list.append(p["email"])
    for e in (p.get("personal_emails") or []):
        if e and e not in emails_list:
            emails_list.append(e)
    for e_obj in (p.get("emails") or []):
        val = e_obj.get("email") if isinstance(e_obj, dict) else e_obj
        if val and val not in emails_list:
            emails_list.append(val)

    return {
        "found": True,
        "apollo_id": apollo_id,
        "nombre": p.get("name"),
        "primer_nombre": p.get("first_name"),
        "apellido": p.get("last_name"),
        "titulo": p.get("title"),
        "email": emails_list[0] if emails_list else None,
        "email_estado": p.get("email_status"),
        "emails_personales": emails_list[1:] if len(emails_list) > 1 else [],
        "telefono": None,
        "linkedin_url": p.get("linkedin_url"),
        "foto_url": p.get("photo_url"),
        "ciudad": p.get("city"),
        "pais": p.get("country"),
        "empresa": (p.get("organization") or {}).get("name"),
    }
