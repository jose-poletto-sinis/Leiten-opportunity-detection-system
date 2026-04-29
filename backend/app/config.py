"""Configuración del servicio leída de variables de entorno."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    service_name: str
    log_level: str
    scraping_timeout_seconds: int

    llm_provider: str          # openai | azure | mock
    openai_api_key: str
    openai_model: str

    azure_openai_endpoint: str
    azure_openai_api_key: str
    azure_openai_deployment: str
    azure_openai_api_version: str

    scraper_user_agent: str


@lru_cache
def get_settings() -> Settings:
    return Settings(
        service_name=os.getenv("SERVICE_NAME", "leiten-intel-scraper"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        scraping_timeout_seconds=int(os.getenv("SCRAPING_TIMEOUT_SECONDS", "75")),
        llm_provider=os.getenv("LLM_PROVIDER", "mock").lower(),
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        azure_openai_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
        azure_openai_api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
        azure_openai_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT", ""),
        azure_openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
        scraper_user_agent=os.getenv(
            "SCRAPER_USER_AGENT",
            "LeitenIntelBot/1.0 (+https://leiten.com/contacto)",
        ),
    )
