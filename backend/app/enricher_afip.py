"""
Consulta de datos oficiales de empresas argentinas via padrón AFIP.

Dado un CUIT, devuelve razón social, estado, domicilio fiscal y actividades.
API pública gratuita — no requiere key.
"""
from __future__ import annotations

import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

AFIP_API = "https://api.argentinadatos.com/v1/padron-afip/persona"


def _clean_cuit(cuit: str) -> str:
    return re.sub(r"[^0-9]", "", cuit)


def enrich_with_afip(cuit: str) -> dict[str, Any]:
    """
    Consulta el padrón AFIP por CUIT.

    Returns:
        dict con datos de la empresa, o {"found": False} si no existe
    """
    cuit_clean = _clean_cuit(cuit)
    if len(cuit_clean) != 11:
        return {"found": False, "cuit": cuit, "error": "CUIT inválido (debe tener 11 dígitos)"}

    with httpx.Client(timeout=10) as client:
        resp = client.get(f"{AFIP_API}/{cuit_clean}")
        if resp.status_code == 404:
            return {"found": False, "cuit": cuit_clean}
        resp.raise_for_status()
        data = resp.json()

    if not data:
        return {"found": False, "cuit": cuit_clean}

    domicilio = data.get("domicilio") or {}
    actividades = data.get("actividades") or []
    actividad_principal = next(
        (a.get("descripcion") for a in actividades if a.get("orden") == 1),
        actividades[0].get("descripcion") if actividades else None,
    )

    return {
        "found": True,
        "cuit": cuit_clean,
        "razon_social": data.get("razonSocial"),
        "tipo_persona": data.get("tipoPersona"),
        "estado": data.get("estadoClave"),
        "actividad_principal": actividad_principal,
        "domicilio": {
            "calle": domicilio.get("direccion"),
            "localidad": domicilio.get("localidad"),
            "provincia": domicilio.get("descripcionProvincia"),
            "codigo_postal": domicilio.get("codPostal"),
        },
        "impuestos": [i.get("descripcion") for i in (data.get("impuestos") or [])],
        "fecha_inicio_actividades": data.get("fechaInscripcion"),
    }
