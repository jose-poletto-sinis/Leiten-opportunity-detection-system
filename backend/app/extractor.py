"""
Extractor LLM: toma el contenido de una página + un prompt del usuario y devuelve
filas estructuradas para mostrar en una tabla.

Soporta tres providers:
- openai  (OpenAI estándar)
- azure   (Azure OpenAI / Azure AI Foundry)
- mock    (heurística + regex; útil para dev/demo y como fallback)

Devuelve siempre la misma forma: { "columns": [...], "rows": [{...}, ...], "warnings": [...] }
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

from .config import Settings, get_settings

logger = logging.getLogger(__name__)


# ---------- Schema sugerido al LLM ----------
SUGGESTED_FIELDS = [
    "razon_social",
    "cuit",
    "domicilio",
    "telefono",
    "email",
    "web",
    "referente",
    "obras",
    "rubro",
    "observaciones",
]

SYSTEM_PROMPT = """Sos un asistente de inteligencia comercial para una empresa de construcción.
Tu tarea es leer el contenido de una página web y extraer información estructurada
sobre EMPRESAS, OBRAS y DESARROLLADORAS según la instrucción del usuario.

Reglas:
- Devolvé SIEMPRE JSON válido con las claves "columns" (lista de strings) y
  "rows" (lista de objetos cuyas claves coinciden con "columns").
- Las columnas son DINÁMICAS: incluí todas las que tengan datos en la página.
- Sugeridas (si aplican): razon_social, cuit, domicilio, telefono, email, web,
  referente, obras, rubro, observaciones.
- Si no hay datos relevantes, devolvé "rows": [] y agregá una entrada en "warnings".
- No inventes datos. Si un campo no aparece, omitilo en la fila.
- Normalizá CUIT a formato XX-XXXXXXXX-X cuando sea posible.
- Para "obras" usá una lista o un string separado por comas, lo que sea más legible.
"""


def extract(
    *,
    page_text: str,
    page_meta: dict[str, Any],
    user_prompt: str,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Punto de entrada único — elige provider según config."""
    settings = settings or get_settings()
    provider = settings.llm_provider

    if provider == "openai":
        return _extract_with_openai(page_text, page_meta, user_prompt, settings)
    if provider == "azure":
        return _extract_with_azure(page_text, page_meta, user_prompt, settings)
    return _extract_with_mock(page_text, page_meta, user_prompt)


# ---------- OpenAI ----------
@retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=4), reraise=True)
def _extract_with_openai(
    page_text: str,
    page_meta: dict[str, Any],
    user_prompt: str,
    settings: Settings,
) -> dict[str, Any]:
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY vacía; cayendo al extractor mock.")
        return _extract_with_mock(page_text, page_meta, user_prompt)

    from openai import OpenAI  # import perezoso para no penalizar el arranque

    client = OpenAI(api_key=settings.openai_api_key)
    user_msg = _build_user_message(page_text, page_meta, user_prompt)

    completion = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    raw = completion.choices[0].message.content or "{}"
    return _coerce_response(raw)


# ---------- Azure OpenAI / Azure AI Foundry ----------
@retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=4), reraise=True)
def _extract_with_azure(
    page_text: str,
    page_meta: dict[str, Any],
    user_prompt: str,
    settings: Settings,
) -> dict[str, Any]:
    if not (settings.azure_openai_endpoint and settings.azure_openai_api_key and settings.azure_openai_deployment):
        logger.warning("Config Azure incompleta; cayendo al extractor mock.")
        return _extract_with_mock(page_text, page_meta, user_prompt)

    from openai import AzureOpenAI

    client = AzureOpenAI(
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
    )
    user_msg = _build_user_message(page_text, page_meta, user_prompt)

    completion = client.chat.completions.create(
        model=settings.azure_openai_deployment,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    raw = completion.choices[0].message.content or "{}"
    return _coerce_response(raw)


# ---------- Mock heurístico ----------
_RE_CUIT = re.compile(r"\b(?:\d{2}-?\d{8}-?\d{1})\b")
_RE_PHONE = re.compile(r"\b(?:\+?54[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{4}\b")
_RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_RE_WEB = re.compile(r"https?://[^\s)]+|www\.[^\s)]+", re.IGNORECASE)


def _extract_with_mock(
    page_text: str,
    page_meta: dict[str, Any],
    user_prompt: str,
) -> dict[str, Any]:
    """Heurística simple: regex + meta tags. No reemplaza al LLM, sirve para demos."""
    cuits = sorted(set(_RE_CUIT.findall(page_text)))
    phones = sorted({p.strip() for p in _RE_PHONE.findall(page_text) if len(p) >= 8})
    emails = sorted(set(_RE_EMAIL.findall(page_text)))
    webs = sorted(set(_RE_WEB.findall(page_text)))

    meta_tags: dict[str, str] = (page_meta or {}).get("meta_tags", {})
    razon_social = (
        meta_tags.get("og:site_name")
        or meta_tags.get("application-name")
        or page_meta.get("title")
        or ""
    )

    row = {
        "razon_social": razon_social,
        "cuit": cuits[0] if cuits else "",
        "telefono": phones[0] if phones else "",
        "email": emails[0] if emails else "",
        "web": webs[0] if webs else "",
        "observaciones": f"Prompt: {user_prompt[:140]}",
    }
    row = {k: v for k, v in row.items() if v}

    columns = list(row.keys()) or ["observaciones"]
    rows = [row] if row else []
    warnings = ["Extractor mock activo — configurar LLM_PROVIDER para producción."]
    if not rows:
        warnings.append("No se detectaron campos relevantes mediante heurística.")

    return {"columns": columns, "rows": rows, "warnings": warnings}


# ---------- Helpers ----------
def _build_user_message(
    page_text: str,
    page_meta: dict[str, Any],
    user_prompt: str,
) -> str:
    meta_summary = json.dumps(page_meta or {}, ensure_ascii=False)[:4000]
    text_capped = page_text[:60_000]
    return (
        f"INSTRUCCIÓN DEL USUARIO:\n{user_prompt}\n\n"
        f"METADATOS DE LA PÁGINA (json):\n{meta_summary}\n\n"
        f"CONTENIDO DE LA PÁGINA (texto plano, recortado):\n{text_capped}"
    )


def _coerce_response(raw: str) -> dict[str, Any]:
    """Acepta JSON ya parseado o un string; valida estructura mínima."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        logger.exception("LLM devolvió JSON inválido. Respuesta cruda: %s", raw[:500])
        return {
            "columns": [],
            "rows": [],
            "warnings": ["El modelo devolvió un JSON inválido; revisar el prompt."],
        }

    columns = data.get("columns") or []
    rows = data.get("rows") or []
    warnings = data.get("warnings") or []

    # Si vienen rows pero no columns, derivar columns del primer row.
    if rows and not columns:
        seen: list[str] = []
        for row in rows:
            for key in row.keys():
                if key not in seen:
                    seen.append(key)
        columns = seen

    # Garantizar que cada row sea un dict y que las claves estén en columns.
    cleaned_rows: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            warnings.append("Se descartó una fila no estructurada devuelta por el LLM.")
            continue
        cleaned_rows.append(row)
        for key in row.keys():
            if key not in columns:
                columns.append(key)

    return {"columns": columns, "rows": cleaned_rows, "warnings": warnings}
