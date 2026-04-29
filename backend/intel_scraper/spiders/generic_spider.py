"""
Spider genérico que descarga UNA página, devuelve HTML + texto plano + metadatos.

No sigue links: la pantalla pide una URL puntual y el extractor LLM se encarga
de interpretar el contenido. Si en el futuro se quiere ampliar a varias páginas
del mismo dominio, agregar parsers específicos como sub-spiders.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterator

import scrapy
from bs4 import BeautifulSoup

from intel_scraper.items import PageItem


class GenericPageSpider(scrapy.Spider):
    name = "generic_page"

    custom_settings = {
        "DEPTH_LIMIT": 0,
        "CLOSESPIDER_PAGECOUNT": 1,
    }

    def __init__(self, target_url: str | None = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not target_url:
            raise ValueError("target_url es obligatorio")
        self.start_urls = [target_url]

    def parse(self, response: scrapy.http.Response) -> Iterator[PageItem]:
        soup = BeautifulSoup(response.text, "lxml")

        # Saco scripts/styles para que el texto plano sea más útil para el LLM.
        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        text = " ".join(soup.get_text(separator=" ", strip=True).split())
        title = (soup.title.string.strip() if soup.title and soup.title.string else "")

        meta_tags = {
            (m.get("name") or m.get("property") or "").lower(): (m.get("content") or "")
            for m in soup.find_all("meta")
            if m.get("name") or m.get("property")
        }

        jsonld_blocks: list[str] = []
        for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
            if tag.string:
                jsonld_blocks.append(tag.string.strip())

        yield PageItem(
            url=response.url,
            final_url=response.url,
            status=response.status,
            title=title,
            html=response.text,
            text=text[:200_000],  # cap defensivo: 200k chars
            meta={
                "meta_tags": meta_tags,
                "jsonld": jsonld_blocks,
            },
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )
