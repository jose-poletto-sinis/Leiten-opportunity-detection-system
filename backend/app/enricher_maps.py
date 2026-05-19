"""
Enriquecimiento de datos de empresas usando Google Places API.

Dado un nombre de empresa (y opcionalmente una pista de ubicación),
busca en Google Places y devuelve datos de contacto y ubicación verificados.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

FIND_PLACE_URL  = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
DETAILS_URL     = "https://maps.googleapis.com/maps/api/place/details/json"
TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"

DETAIL_FIELDS = ",".join([
    "name",
    "formatted_address",
    "formatted_phone_number",
    "international_phone_number",
    "website",
    "url",
    "types",
    "business_status",
    "rating",
    "user_ratings_total",
    "opening_hours",
])


def enrich_with_maps(query: str, api_key: str, country_hint: str = "AR") -> dict[str, Any]:
    """
    Busca una empresa en Google Places y devuelve sus datos enriquecidos.

    Args:
        query: nombre de la empresa (puede incluir dirección o ciudad)
        api_key: Google Maps API key
        country_hint: código de país para acotar la búsqueda

    Returns:
        dict con los datos encontrados, o {"found": False} si no hay resultados
    """
    if not api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no configurada.")

    # 1. Find Place — obtiene el place_id
    find_params = {
        "input": f"{query} {country_hint}",
        "inputtype": "textquery",
        "fields": "place_id,name,formatted_address",
        "locationbias": "country:ar",
        "key": api_key,
        "language": "es",
    }

    with httpx.Client(timeout=10) as client:
        find_resp = client.get(FIND_PLACE_URL, params=find_params)
        find_resp.raise_for_status()
        find_data = find_resp.json()

    candidates = find_data.get("candidates", [])
    if not candidates:
        return {"found": False, "query": query}

    place_id = candidates[0]["place_id"]

    # 2. Place Details — obtiene todos los campos
    detail_params = {
        "place_id": place_id,
        "fields": DETAIL_FIELDS,
        "key": api_key,
        "language": "es",
    }

    with httpx.Client(timeout=10) as client:
        detail_resp = client.get(DETAILS_URL, params=detail_params)
        detail_resp.raise_for_status()
        detail_data = detail_resp.json()

    result = detail_data.get("result", {})
    if not result:
        return {"found": False, "query": query, "place_id": place_id}

    # Categorías legibles (sin los prefijos de Google)
    raw_types = result.get("types", [])
    readable_types = [t.replace("_", " ") for t in raw_types if t not in ("point_of_interest", "establishment")]

    return {
        "found": True,
        "query": query,
        "place_id": place_id,
        "nombre": result.get("name"),
        "direccion": result.get("formatted_address"),
        "telefono": result.get("formatted_phone_number"),
        "telefono_intl": result.get("international_phone_number"),
        "web": result.get("website"),
        "maps_url": result.get("url"),
        "categorias": readable_types,
        "estado": result.get("business_status"),
        "rating": result.get("rating"),
        "total_reviews": result.get("user_ratings_total"),
    }


def search_obras_nearby(lat: float, lng: float, radio_metros: int, api_key: str) -> list[dict]:
    """
    Busca obras y constructoras activas en un radio alrededor de un punto.

    Usa Google Places Text Search con múltiples queries para maximizar resultados.
    """
    if not api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no configurada.")

    queries = [
        # obras activas
        "obras en construcción",
        "obra en ejecución",
        # constructoras y contratistas generales
        "empresa constructora",
        "contratista construcción",
        "empresa de albañilería",
        # especialidades
        "empresa revoque yesería",
        "empresa de redes agua cloaca",
        "empresa bacheo pavimento",
        # galpones y estructuras
        "galponero fabricante galpones",
        "construcción galpones industriales",
        # estudios y desarrollo
        "estudio de arquitectura",
        "desarrolladora inmobiliaria",
        # vialidad y mantenimiento
        "empresa vial obras viales",
        "empresa mantenimiento edilicio",
    ]
    seen: set[str] = set()
    results: list[dict] = []

    with httpx.Client(timeout=15) as client:
        for q in queries:
            params = {
                "query": q,
                "location": f"{lat},{lng}",
                "radius": radio_metros,
                "key": api_key,
                "language": "es",
            }
            resp = client.get(TEXT_SEARCH_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

            for place in data.get("results", []):
                pid = place.get("place_id")
                if not pid or pid in seen:
                    continue
                seen.add(pid)

                loc = place.get("geometry", {}).get("location", {})
                raw_types = place.get("types", [])
                readable = [
                    t.replace("_", " ")
                    for t in raw_types
                    if t not in ("point_of_interest", "establishment")
                ]

                results.append({
                    "place_id": pid,
                    "nombre": place.get("name"),
                    "direccion": place.get("formatted_address"),
                    "lat": loc.get("lat"),
                    "lng": loc.get("lng"),
                    "categorias": readable,
                    "rating": place.get("rating"),
                    "total_reviews": place.get("user_ratings_total"),
                    "estado": place.get("business_status"),
                    "maps_url": f"https://www.google.com/maps/place/?q=place_id:{pid}",
                })

    return results
