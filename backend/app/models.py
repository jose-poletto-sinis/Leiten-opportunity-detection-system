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


class LoginRequest(BaseModel):
    cod_usr: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    session_id: str
    cod_usr: str
    nom_usr: str
    expires_in_minutes: int


class UserInfo(BaseModel):
    session_id: str
    cod_usr: str
    nom_usr: str


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
    saved_id: UUID | None = Field(default=None, description="ID del registro guardado automáticamente")


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
    saved_id: UUID | None = Field(default=None)


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


# ─── URLs registradas ────────────────────────────────────────────────────────

class RegisterUrlRequest(BaseModel):
    url: HttpUrl
    nombre: str | None = None
    cargado_por: str | None = None
    frecuencia: Literal["diaria", "semanal", "mensual"] = "semanal"
    prompt: str | None = None
    fecha_inicio: str | None = None
    fecha_fin: str | None = None


class UpdateFrecuenciaRequest(BaseModel):
    frecuencia: Literal["diaria", "semanal", "mensual"]


class UpdateRegisteredUrlRequest(BaseModel):
    nombre: str | None = None
    url: HttpUrl | None = None
    frecuencia: Literal["diaria", "semanal", "mensual"] | None = None
    prompt: str | None = None
    fecha_inicio: str | None = None
    fecha_fin: str | None = None


class RegisteredUrl(BaseModel):
    id: str
    nombre: str | None = None
    url: str
    cargado_por: str | None
    frecuencia: str
    prompt: str | None = None
    fecha_inicio: str | None = None
    fecha_fin: str | None = None
    fecha_ultimo_scraping: str | None
    created_at: str


class ScrapeNowResponse(BaseModel):
    registered_id: str
    url: str
    saved_id: UUID | None
    columns: list[str]
    rows: list[dict[str, Any]]
    warnings: list[str]
    elapsed_ms: int


# ─── Prompt del sistema ───────────────────────────────────────────────────────

class PromptConfig(BaseModel):
    prompt: str
    updated_at: str | None = None


# ─── Enriquecimiento Maps ─────────────────────────────────────────────────────

class MapsEnrichRequest(BaseModel):
    query: str = Field(..., min_length=2, description="Nombre de la empresa a buscar")
    country_hint: str = Field(default="AR")


class MapsEnrichResponse(BaseModel):
    found: bool
    query: str
    place_id: str | None = None
    nombre: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    telefono_intl: str | None = None
    web: str | None = None
    maps_url: str | None = None
    categorias: list[str] = Field(default_factory=list)
    estado: str | None = None
    rating: float | None = None
    total_reviews: int | None = None


# ─── Búsqueda de obras por zona ───────────────────────────────────────────────

class ObrasSearchRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radio_metros: int = Field(default=5000, ge=500, le=50000)


class ObraResult(BaseModel):
    place_id: str
    nombre: str
    direccion: str | None = None
    lat: float | None = None
    lng: float | None = None
    categorias: list[str] = Field(default_factory=list)
    rating: float | None = None
    total_reviews: int | None = None
    estado: str | None = None
    maps_url: str | None = None


class ObrasSearchResponse(BaseModel):
    lat: float
    lng: float
    radio_metros: int
    total: int
    results: list[ObraResult]


# ─── Enriquecimiento Apollo ───────────────────────────────────────────────────

class ApolloOrgRequest(BaseModel):
    domain: str = Field(..., min_length=3, description="Dominio de la empresa (ej: acme.com)")


class ApolloOrgResponse(BaseModel):
    found: bool
    domain: str
    nombre: str | None = None
    sitio_web: str | None = None
    linkedin_url: str | None = None
    twitter_url: str | None = None
    facebook_url: str | None = None
    telefono: str | None = None
    industria: str | None = None
    sub_industria: str | None = None
    empleados: int | None = None
    rango_empleados: str | None = None
    pais: str | None = None
    estado_provincia: str | None = None
    ciudad: str | None = None
    descripcion: str | None = None
    tecnologias: list[str] = Field(default_factory=list)
    palabras_clave: list[str] = Field(default_factory=list)
    ingresos_anuales: float | None = None
    rango_ingresos: str | None = None
    fundacion: int | None = None
    apollo_id: str | None = None


class ApolloPeopleRequest(BaseModel):
    domain: str | None = Field(default=None, description="Dominio de la empresa (preferido)")
    org_name: str | None = Field(default=None, description="Nombre de la empresa (alternativa)")
    titulos: list[str] = Field(default_factory=list, description='Cargos a filtrar (ej: ["CEO", "Director"])')
    pagina: int = Field(default=1, ge=1)
    por_pagina: int = Field(default=10, ge=1, le=25)


class ApolloContacto(BaseModel):
    nombre: str | None = None
    primer_nombre: str | None = None
    apellido: str | None = None
    titulo: str | None = None
    email: str | None = None
    email_estado: str | None = None
    linkedin_url: str | None = None
    telefono: str | None = None
    ciudad: str | None = None
    estado_provincia: str | None = None
    pais: str | None = None
    empresa: str | None = None
    empresa_dominio: str | None = None
    apollo_id: str | None = None


class ApolloPeopleResponse(BaseModel):
    found: bool
    total: int
    pagina: int
    por_pagina: int
    contactos: list[ApolloContacto]


class ApolloRevealRequest(BaseModel):
    apollo_id: str = Field(..., description="ID del contacto en Apollo")


class ApolloRevealResponse(BaseModel):
    found: bool
    apollo_id: str
    nombre: str | None = None
    primer_nombre: str | None = None
    apellido: str | None = None
    titulo: str | None = None
    email: str | None = None
    email_estado: str | None = None
    emails_personales: list[str] = Field(default_factory=list)
    telefono: str | None = None
    linkedin_url: str | None = None
    foto_url: str | None = None
    ciudad: str | None = None
    pais: str | None = None
    empresa: str | None = None


# ─── AFIP ─────────────────────────────────────────────────────────────────────

class AfipRequest(BaseModel):
    cuit: str = Field(..., description="CUIT de la empresa (con o sin guiones)")


class AfipDomicilio(BaseModel):
    calle: str | None = None
    localidad: str | None = None
    provincia: str | None = None
    codigo_postal: str | None = None


class AfipResponse(BaseModel):
    found: bool
    cuit: str
    error: str | None = None
    razon_social: str | None = None
    tipo_persona: str | None = None
    estado: str | None = None
    actividad_principal: str | None = None
    domicilio: AfipDomicilio | None = None
    impuestos: list[str] = Field(default_factory=list)
    fecha_inicio_actividades: str | None = None


# ─── Hunter.io ────────────────────────────────────────────────────────────────

class HunterRequest(BaseModel):
    domain: str = Field(..., min_length=3, description="Dominio de la empresa (ej: acme.com)")


class HunterEmail(BaseModel):
    email: str | None = None
    tipo: str | None = None
    confianza: int | None = None
    nombre: str | None = None
    apellido: str | None = None
    cargo: str | None = None
    linkedin: str | None = None
    verificado: bool | None = None


class HunterResponse(BaseModel):
    found: bool
    domain: str
    organizacion: str | None = None
    total_emails: int = 0
    patron_email: str | None = None
    emails: list[HunterEmail] = Field(default_factory=list)
