"""
Wrapper alrededor de Scrapy para correrlo desde un proceso síncrono (FastAPI).

Usa `crochet` para integrar el reactor de Twisted con código async/sync.
Cada llamada arranca el reactor (idempotente), corre el spider con la URL
solicitada y devuelve el item resultante.

Para URLs que apuntan directamente a un PDF (path terminado en .pdf) se omite
Scrapy y se extrae el texto con pdfplumber.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
import pdfplumber
from crochet import setup as crochet_setup, wait_for
from scrapy.crawler import CrawlerRunner
from scrapy.utils.project import get_project_settings

from intel_scraper.spiders.generic_spider import GenericPageSpider

logger = logging.getLogger(__name__)

# Inicializamos el reactor una sola vez, en el arranque del proceso.
crochet_setup()


class _CollectingSpider(GenericPageSpider):
    """Override mínimo para juntar el item en una lista accesible desde fuera."""

    collected: list[dict[str, Any]]

    def __init__(self, *args, collected: list[dict[str, Any]] | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.collected = collected if collected is not None else []

    def parse(self, response):
        for item in super().parse(response):
            data = dict(item)
            self.collected.append(data)
            yield item


@wait_for(timeout=120.0)  # cota dura por encima del SCRAPING_TIMEOUT_SECONDS
def _run_spider_blocking(target_url: str, timeout_seconds: int) -> list[dict[str, Any]]:
    settings = get_project_settings()
    settings.set("DOWNLOAD_TIMEOUT", timeout_seconds, priority="cmdline")
    settings.set("CLOSESPIDER_TIMEOUT", timeout_seconds, priority="cmdline")

    runner = CrawlerRunner(settings)
    collected: list[dict[str, Any]] = []
    deferred = runner.crawl(
        _CollectingSpider,
        target_url=target_url,
        collected=collected,
    )
    deferred.addCallback(lambda _: collected)
    return deferred


def _is_pdf_url(url: str) -> bool:
    return urlparse(url).path.lower().endswith(".pdf")


def _fetch_pdf(url: str, timeout_seconds: int) -> dict[str, Any]:
    response = httpx.get(url, timeout=timeout_seconds, follow_redirects=True)
    response.raise_for_status()

    pages_text: list[str] = []
    with pdfplumber.open(io.BytesIO(response.content)) as pdf:
        for page in pdf.pages:
            extracted = page.extract_text()
            if extracted:
                pages_text.append(extracted)

    full_text = "\n".join(pages_text)

    return {
        "url": url,
        "final_url": str(response.url),
        "status": response.status_code,
        "title": "",
        "html": "",
        "text": full_text[:200_000],
        "meta": {"meta_tags": {}, "jsonld": []},
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def fetch_page(target_url: str, timeout_seconds: int = 75) -> dict[str, Any]:
    """
    Devuelve el item de la página o lanza RuntimeError si no se pudo obtener.
    Si la URL termina en .pdf, extrae el texto del PDF directamente.
    """
    if _is_pdf_url(target_url):
        logger.info("URL detectada como PDF, extrayendo con pdfplumber: %s", target_url)
        return _fetch_pdf(target_url, timeout_seconds)

    items = _run_spider_blocking(target_url, timeout_seconds)
    if not items:
        raise RuntimeError(
            "No se obtuvo contenido de la URL "
            "(robots.txt, timeout, error HTTP o página vacía)."
        )
    return items[0]
