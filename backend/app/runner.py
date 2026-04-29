"""
Wrapper alrededor de Scrapy para correrlo desde un proceso síncrono (FastAPI).

Usa `crochet` para integrar el reactor de Twisted con código async/sync.
Cada llamada arranca el reactor (idempotente), corre el spider con la URL
solicitada y devuelve el item resultante.
"""
from __future__ import annotations

import logging
from typing import Any

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


def fetch_page(target_url: str, timeout_seconds: int = 75) -> dict[str, Any]:
    """
    Devuelve el item de la página o lanza RuntimeError si no se pudo obtener.
    """
    items = _run_spider_blocking(target_url, timeout_seconds)
    if not items:
        raise RuntimeError(
            "No se obtuvo contenido de la URL "
            "(robots.txt, timeout, error HTTP o página vacía)."
        )
    return items[0]
