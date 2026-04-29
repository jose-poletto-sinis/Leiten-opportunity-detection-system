"""Item devuelto por el spider genérico antes de pasarlo al extractor LLM."""
from __future__ import annotations

import scrapy


class PageItem(scrapy.Item):
    url = scrapy.Field()
    final_url = scrapy.Field()        # tras redirects
    status = scrapy.Field()
    title = scrapy.Field()
    html = scrapy.Field()             # HTML crudo (para extractor)
    text = scrapy.Field()             # texto plano limpio
    meta = scrapy.Field()             # meta tags + jsonld + opengraph
    fetched_at = scrapy.Field()
