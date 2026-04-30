"""Schemas Pydantic para request/response del endpoint de scraping."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ScrapeRequest(BaseModel):
    """Payload que envía la pantalla Next.js."""

    url: HttpUrl = Field(..., description="URL pública a analizar")
    prompt: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="Instrucción en lenguaje natural describiendo qué extraer",
    )
    user_id: str | None = Field(
        default=None,
        description="ID del usuario que dispara la solicitud (auditoría)",
    )

    @field_validator("prompt")
    @classmethod
    def _strip_prompt(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El prompt no puede estar vacío")
        return cleaned


class MultiScrapeRequest(BaseModel):
    """Payload batch: entre 1 y 50 URLs con un prompt compartido."""

    urls: list[HttpUrl] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Lista de URLs públicas a analizar (mínimo 1, máximo 50)",
    )
    prompt: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="Instrucción en lenguaje natural compartida para todas las URLs",
    )
    user_id: str | None = Field(default=None)

    @field_validator("prompt")
    @classmethod
    def _strip_prompt(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El prompt no puede estar vacío")
        return cleaned


class ScrapedRow(BaseModel):
    """
    Cada fila es un dict abierto (columnas dinámicas según lo que detecte el LLM).
    Algunos campos sugeridos: razon_social, cuit, domicilio, telefono, email, web,
    referente, obras, otros.
    """

    data: dict[str, Any]


class ScrapeResponse(BaseModel):
    request_id: UUID = Field(default_factory=uuid4)
    url: str
    prompt: str
    columns: list[str] = Field(
        default_factory=list,
        description="Orden sugerido de columnas para renderizar la tabla",
    )
    rows: list[dict[str, Any]] = Field(default_factory=list)
    extracted_at: datetime = Field(default_factory=datetime.utcnow)
    elapsed_ms: int = 0
    warnings: list[str] = Field(default_factory=list)


class BatchScrapeItemResponse(BaseModel):
    """Resultado de una URL individual dentro de un batch."""

    request_id: UUID = Field(default_factory=uuid4)
    url: str
    status: Literal["ok", "error"]
    columns: list[str] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    elapsed_ms: int = 0
    error_message: str | None = None


class BatchScrapeResponse(BaseModel):
    results: list[BatchScrapeItemResponse]
    prompt: str
    total_urls: int
    ok_count: int
    error_count: int


class SaveRequest(BaseModel):
    """El usuario presiona Guardar tras revisar la tabla."""

    request_id: UUID
    url: HttpUrl
    prompt: str
    columns: list[str]
    rows: list[dict[str, Any]]
    user_id: str | None = None


class SaveResponse(BaseModel):
    saved_id: UUID
    persisted_rows: int
    message: str = "Información guardada correctamente"


class BatchSaveItem(BaseModel):
    """Un ítem del batch a guardar."""

    request_id: UUID
    url: str
    columns: list[str]
    rows: list[dict[str, Any]]


class BatchSaveRequest(BaseModel):
    """Guardar todos los resultados ok de un batch."""

    results: list[BatchSaveItem]
    prompt: str
    user_id: str | None = None


class BatchSaveResponse(BaseModel):
    saved_ids: list[str]
    total_persisted_rows: int
    message: str = "Información guardada correctamente"


class RecordSummary(BaseModel):
    """Fila en el listado de historial."""

    saved_id: str
    request_id: str
    url: str
    prompt: str
    row_count: int
    user_id: str | None
    status: str = "pendiente"
    created_at: str


class RecordDetail(BaseModel):
    """Detalle completo de un registro guardado."""

    saved_id: str
    request_id: str
    url: str
    prompt: str
    columns: list[str]
    rows: list[dict[str, Any]]
    user_id: str | None
    status: str = "pendiente"
    created_at: str


class RecordsResponse(BaseModel):
    items: list[RecordSummary]
    total: int
    limit: int
    offset: int


class ErrorResponse(BaseModel):
    error_code: str
    message: str
    details: dict[str, Any] | None = None
