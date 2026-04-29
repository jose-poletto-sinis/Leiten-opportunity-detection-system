"""Settings de Scrapy para el spider genérico."""
import os

BOT_NAME = "intel_scraper"

SPIDER_MODULES = ["intel_scraper.spiders"]
NEWSPIDER_MODULE = "intel_scraper.spiders"

ROBOTSTXT_OBEY = True
USER_AGENT = os.getenv(
    "SCRAPER_USER_AGENT",
    "LeitenIntelBot/1.0 (+https://leiten.com/contacto)",
)

# Una solicitud por dominio: el flujo de la pantalla siempre pide UNA URL.
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 2
DOWNLOAD_TIMEOUT = int(os.getenv("SCRAPING_TIMEOUT_SECONDS", "75"))
DOWNLOAD_MAXSIZE = 10 * 1024 * 1024  # 10 MB

# Reintentos suaves
RETRY_ENABLED = True
RETRY_TIMES = 2
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# Mantener un perfil low-noise: nada de telnet
TELNETCONSOLE_ENABLED = False

# Devolver fechas en ISO
FEED_EXPORT_ENCODING = "utf-8"

# Headers conservadores
DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.7",
}

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
