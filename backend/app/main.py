"""
API HTTP que expone el flujo de scraping inteligente.

Endpoints:
  POST /v1/intel/scrape             -> URL única (retrocompatibilidad)
  POST /v1/intel/scrape-batch       -> hasta 50 URLs en paralelo controlado
  POST /v1/intel/save               -> persiste un resultado
  POST /v1/intel/save-batch         -> persiste todos los resultados de un batch
  POST /v1/intel/discard            -> registra descarte
  GET  /v1/intel/records            -> historial paginado
  GET  /v1/intel/records/{id}       -> detalle de un registro
  DELETE /v1/intel/records/{id}     -> eliminar registro

  POST /v1/intel/urls               -> registrar URL con frecuencia
  GET  /v1/intel/urls               -> listar URLs registradas
  PATCH /v1/intel/urls/{id}         -> actualizar frecuencia
  DELETE /v1/intel/urls/{id}        -> eliminar URL registrada
  POST /v1/intel/urls/{id}/scrape   -> scrape manual de URL registrada

  GET  /v1/sistemas/prompt          -> obtener prompt activo
  PUT  /v1/sistemas/prompt          -> actualizar prompt

  GET  /healthz                     -> health probe para Azure
"""
from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse as _JSONResponse

from .config import get_settings
from .extractor import extract
from .enricher_maps import enrich_with_maps, search_obras_nearby
from .enricher_apollo import enrich_org as apollo_enrich_org, search_people as apollo_search_people, reveal_contact as apollo_reveal_contact
from .enricher_afip import enrich_with_afip
from .enricher_hunter import search_emails_by_domain as hunter_search
from .models import (
    LoginRequest,
    LoginResponse,
    UserInfo,
    BatchSaveRequest,
    BatchSaveResponse,
    BatchScrapeItemResponse,
    BatchScrapeResponse,
    ErrorResponse,
    MapsEnrichRequest,
    MapsEnrichResponse,
    MultiScrapeRequest,
    ObrasSearchRequest,
    ObrasSearchResponse,
    ObraResult,
    ApolloOrgRequest,
    ApolloOrgResponse,
    ApolloPeopleRequest,
    ApolloPeopleResponse,
    ApolloContacto,
    ApolloRevealRequest,
    ApolloRevealResponse,
    AfipRequest,
    AfipResponse,
    AfipDomicilio,
    HunterRequest,
    HunterResponse,
    HunterEmail,
    PromptConfig,
    RecordDetail,
    RecordsResponse,
    RegisteredUrl,
    RegisterUrlRequest,
    SaveRequest,
    SaveResponse,
    ScrapeNowResponse,
    ScrapeRequest,
    ScrapeResponse,
    UpdateFrecuenciaRequest,
)
from .runner import fetch_page
from .storage import (
    create_session,
    delete_record,
    delete_registered_url,
    delete_session,
    get_active_prompt,
    get_record,
    get_session,
    get_system_config,
    get_urls_due_for_scraping,
    list_records,
    list_registered_urls,
    log_audit,
    mark_url_scraped,
    register_url,
    save_record,
    set_system_config,
    update_registered_url,
)

settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s [%(levelname)s] %(name)s :: %(message)s",
)
logger = logging.getLogger(settings.service_name)


async def _scheduled_scraper() -> None:
    """Corre en background: cada 5 minutos revisa qué URLs están listas para scrapear."""
    while True:
        await asyncio.sleep(300)
        try:
            due = get_urls_due_for_scraping()
            if not due:
                continue
            logger.info("Scheduler: %d URL/s pendientes de scraping.", len(due))
            prompt = get_active_prompt()
            loop = asyncio.get_running_loop()
            for entry in due:
                try:
                    page = await asyncio.wait_for(
                        loop.run_in_executor(None, fetch_page, entry["url"], settings.scraping_timeout_seconds),
                        timeout=settings.scraping_timeout_seconds + 5,
                    )
                    extracted = extract(
                        page_text=page.get("text", ""),
                        page_meta={**(page.get("meta") or {}), "title": page.get("title")},
                        user_prompt=prompt,
                        settings=settings,
                    )
                    request_id = uuid4()
                    save_record(
                        request_id=request_id,
                        url=entry["url"],
                        prompt=prompt,
                        columns=extracted.get("columns", []),
                        rows=extracted.get("rows", []),
                        user_id=entry.get("cargado_por"),
                    )
                    mark_url_scraped(entry["id"])
                    logger.info("Scheduler: scraped %s OK.", entry["url"])
                except Exception as exc:
                    logger.exception("Scheduler: error scraping %s: %s", entry["url"], exc)
        except Exception as exc:
            logger.exception("Scheduler error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_scheduled_scraper())
    yield
    task.cancel()


app = FastAPI(
    title="Leiten Intel Scraper",
    version="0.1.0",
    description=(
        "Servicio de scraping inteligente para identificar oportunidades de negocio "
        "sobre empresas, obras y desarrolladoras."
    ),
    lifespan=lifespan,
)

# CORS abierto a la app interna. En Azure restringir a los dominios de Leiten.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

_UNPROTECTED = {"/healthz", "/v1/auth/login", "/docs", "/openapi.json", "/redoc"}


class _AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method == "OPTIONS" or request.url.path in _UNPROTECTED:
            return await call_next(request)
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return _JSONResponse(
                status_code=401,
                content={"detail": {"error_code": "UNAUTHORIZED", "message": "Sesión requerida. Iniciá sesión para continuar."}},
            )
        token = auth[7:].strip()
        session = get_session(token)
        if not session:
            return _JSONResponse(
                status_code=401,
                content={"detail": {"error_code": "SESSION_EXPIRED", "message": "Tu sesión expiró. Iniciá sesión nuevamente."}},
            )
        request.state.user = session
        return await call_next(request)


app.add_middleware(_AuthMiddleware)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}


# ─── Auth ─────────────────────────────────────────────────────────────────────

_ERP_LOGIN_URL = "https://erpbackend.leiten.dnscheck.com.ar/auth/login"


@app.post("/v1/auth/login", response_model=LoginResponse)
async def auth_login(req: LoginRequest) -> LoginResponse:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _ERP_LOGIN_URL,
                json={"codUsr": req.cod_usr, "passWord": req.password, "loginAnonimo": False},
            )
    except Exception as exc:
        logger.exception("Error contactando ERP para login: %s", exc)
        raise HTTPException(
            status_code=502,
            detail={"error_code": "ERP_UNAVAILABLE", "message": "No se pudo contactar el servidor de autenticación."},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail={"error_code": "INVALID_CREDENTIALS", "message": "Usuario o contraseña incorrectos."},
        )
    data = resp.json()
    expires = data.get("expiresInMinutes", 1440)
    create_session(
        session_id=data["sessionId"],
        cod_usr=data["codUsr"],
        nom_usr=data["nomUsr"],
        expires_in_minutes=expires,
    )
    return LoginResponse(
        session_id=data["sessionId"],
        cod_usr=data["codUsr"],
        nom_usr=data["nomUsr"],
        expires_in_minutes=expires,
    )


@app.post("/v1/auth/logout")
async def auth_logout(request: Request) -> dict[str, str]:
    user = getattr(request.state, "user", None)
    if user:
        delete_session(user["session_id"])
    return {"status": "ok"}


@app.get("/v1/auth/me", response_model=UserInfo)
async def auth_me(request: Request) -> UserInfo:
    return UserInfo(**request.state.user)


@app.post(
    "/v1/intel/scrape",
    response_model=ScrapeResponse,
    responses={400: {"model": ErrorResponse}, 504: {"model": ErrorResponse}},
)
async def scrape(req: ScrapeRequest) -> ScrapeResponse:
    request_id = uuid4()
    started = time.perf_counter()

    log_audit(
        request_id=request_id,
        action="request",
        url=str(req.url),
        prompt=req.prompt,
        user_id=req.user_id,
    )

    timeout = settings.scraping_timeout_seconds
    loop = asyncio.get_running_loop()

    try:
        page = await asyncio.wait_for(
            loop.run_in_executor(None, fetch_page, str(req.url), timeout),
            timeout=timeout + 5,
        )
    except asyncio.TimeoutError:
        log_audit(request_id=request_id, action="error", url=str(req.url), payload={"error": "timeout"})
        raise HTTPException(
            status_code=504,
            detail={
                "error_code": "SCRAPE_TIMEOUT",
                "message": (
                    f"El scraping superó el timeout de {timeout}s. "
                    "Probá con otra URL o reintentá más tarde."
                ),
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falla scraping URL=%s", req.url)
        log_audit(request_id=request_id, action="error", url=str(req.url), payload={"error": str(exc)})
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "SCRAPE_FAILED",
                "message": (
                    "No se pudo obtener contenido de la URL. "
                    "Verificá que sea pública y accesible."
                ),
                "details": {"reason": str(exc)},
            },
        )

    try:
        extracted = extract(
            page_text=page.get("text", ""),
            page_meta={**(page.get("meta") or {}), "title": page.get("title")},
            user_prompt=req.prompt,
            settings=settings,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falla extractor LLM")
        log_audit(request_id=request_id, action="error", url=str(req.url), payload={"error": str(exc)})
        raise HTTPException(
            status_code=502,
            detail={
                "error_code": "EXTRACTION_FAILED",
                "message": "El extractor LLM devolvió un error. Reintentá en unos minutos.",
                "details": {"reason": str(exc)},
            },
        )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    columns = extracted.get("columns", [])
    rows = extracted.get("rows", [])

    saved_id = save_record(
        request_id=request_id,
        url=str(req.url),
        prompt=req.prompt,
        columns=columns,
        rows=rows,
        user_id=req.user_id,
    )

    response = ScrapeResponse(
        request_id=request_id,
        url=str(req.url),
        prompt=req.prompt,
        columns=columns,
        rows=rows,
        warnings=extracted.get("warnings", []),
        elapsed_ms=elapsed_ms,
        extracted_at=datetime.now(timezone.utc),
        saved_id=saved_id,
    )

    log_audit(
        request_id=request_id,
        action="response",
        url=str(req.url),
        prompt=req.prompt,
        user_id=req.user_id,
        payload={"rows": len(response.rows), "elapsed_ms": elapsed_ms, "saved_id": str(saved_id)},
    )
    return response


async def _scrape_single_url(
    url: str,
    prompt: str,
    user_id: str | None,
    semaphore: asyncio.Semaphore,
) -> BatchScrapeItemResponse:
    """Procesa una URL individual dentro del batch. Nunca lanza excepción."""
    async with semaphore:
        request_id = uuid4()
        started = time.perf_counter()
        timeout = settings.scraping_timeout_seconds
        loop = asyncio.get_running_loop()

        log_audit(request_id=request_id, action="request", url=url, prompt=prompt, user_id=user_id)

        try:
            page = await asyncio.wait_for(
                loop.run_in_executor(None, fetch_page, url, timeout),
                timeout=timeout + 5,
            )
        except asyncio.TimeoutError:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            log_audit(request_id=request_id, action="error", url=url, payload={"error": "timeout"})
            return BatchScrapeItemResponse(
                request_id=request_id,
                url=url,
                status="error",
                elapsed_ms=elapsed_ms,
                error_message=f"Timeout superado ({timeout}s). Probá más tarde.",
            )
        except Exception as exc:  # noqa: BLE001
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            log_audit(request_id=request_id, action="error", url=url, payload={"error": str(exc)})
            return BatchScrapeItemResponse(
                request_id=request_id,
                url=url,
                status="error",
                elapsed_ms=elapsed_ms,
                error_message=f"No se pudo obtener contenido: {str(exc)[:200]}",
            )

        try:
            extracted = extract(
                page_text=page.get("text", ""),
                page_meta={**(page.get("meta") or {}), "title": page.get("title")},
                user_prompt=prompt,
                settings=settings,
            )
        except Exception as exc:  # noqa: BLE001
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            log_audit(request_id=request_id, action="error", url=url, payload={"error": str(exc)})
            return BatchScrapeItemResponse(
                request_id=request_id,
                url=url,
                status="error",
                elapsed_ms=elapsed_ms,
                error_message=f"El extractor LLM falló: {str(exc)[:200]}",
            )

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        columns = extracted.get("columns", [])
        rows = extracted.get("rows", [])

        saved_id = save_record(
            request_id=request_id,
            url=url,
            prompt=prompt,
            columns=columns,
            rows=rows,
            user_id=user_id,
        )

        log_audit(
            request_id=request_id,
            action="response",
            url=url,
            prompt=prompt,
            user_id=user_id,
            payload={"rows": len(rows), "elapsed_ms": elapsed_ms, "saved_id": str(saved_id)},
        )

        return BatchScrapeItemResponse(
            request_id=request_id,
            url=url,
            status="ok",
            columns=columns,
            rows=rows,
            warnings=extracted.get("warnings", []),
            elapsed_ms=elapsed_ms,
            saved_id=saved_id,
        )


@app.post(
    "/v1/intel/scrape-batch",
    response_model=BatchScrapeResponse,
    responses={400: {"model": ErrorResponse}},
)
async def scrape_batch(req: MultiScrapeRequest) -> BatchScrapeResponse:
    semaphore = asyncio.Semaphore(5)
    tasks = [
        _scrape_single_url(str(url), req.prompt, req.user_id, semaphore)
        for url in req.urls
    ]
    results: list[BatchScrapeItemResponse] = await asyncio.gather(*tasks)

    ok_count = sum(1 for r in results if r.status == "ok")
    error_count = len(results) - ok_count

    return BatchScrapeResponse(
        results=results,
        prompt=req.prompt,
        total_urls=len(results),
        ok_count=ok_count,
        error_count=error_count,
    )


@app.post("/v1/intel/save", response_model=SaveResponse)
async def save(req: SaveRequest) -> SaveResponse:
    saved_id = save_record(
        request_id=req.request_id,
        url=str(req.url),
        prompt=req.prompt,
        columns=req.columns,
        rows=req.rows,
        user_id=req.user_id,
    )
    return SaveResponse(saved_id=saved_id, persisted_rows=len(req.rows))


@app.post("/v1/intel/save-batch", response_model=BatchSaveResponse)
async def save_batch(req: BatchSaveRequest) -> BatchSaveResponse:
    saved_ids: list[str] = []
    total_rows = 0

    for item in req.results:
        sid = save_record(
            request_id=item.request_id,
            url=item.url,
            prompt=req.prompt,
            columns=item.columns,
            rows=item.rows,
            user_id=req.user_id,
        )
        saved_ids.append(str(sid))
        total_rows += len(item.rows)

    return BatchSaveResponse(saved_ids=saved_ids, total_persisted_rows=total_rows)


@app.post("/v1/intel/discard")
async def discard(req: SaveRequest) -> dict[str, str]:
    log_audit(
        request_id=req.request_id,
        action="discard",
        url=str(req.url),
        prompt=req.prompt,
        user_id=req.user_id,
        payload={"rows": len(req.rows)},
    )
    return {"status": "discarded"}


@app.get("/v1/intel/records", response_model=RecordsResponse)
async def get_records(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> RecordsResponse:
    data = list_records(limit=limit, offset=offset, user_id=user_id, q=q)
    return RecordsResponse(**data)


@app.get(
    "/v1/intel/records/{saved_id}",
    response_model=RecordDetail,
    responses={404: {"model": ErrorResponse}},
)
async def get_record_detail(saved_id: str) -> RecordDetail:
    record = get_record(saved_id)
    if not record:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "NOT_FOUND", "message": "Registro no encontrado."},
        )
    return RecordDetail(**record)


@app.delete(
    "/v1/intel/records/{saved_id}",
    responses={404: {"model": ErrorResponse}},
)
async def remove_record(
    saved_id: str,
    user_id: str | None = Query(default=None),
) -> dict[str, str]:
    deleted = delete_record(saved_id, user_id=user_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "NOT_FOUND", "message": "Registro no encontrado."},
        )
    return {"status": "deleted", "saved_id": saved_id}


# ─── URLs registradas ────────────────────────────────────────────────────────

@app.post("/v1/intel/urls", response_model=RegisteredUrl)
async def create_registered_url(req: RegisterUrlRequest) -> RegisteredUrl:
    new_id = register_url(
        url=str(req.url),
        cargado_por=req.cargado_por,
        frecuencia=req.frecuencia,
    )
    urls = list_registered_urls()
    entry = next(u for u in urls if u["id"] == new_id)
    return RegisteredUrl(**entry)


@app.get("/v1/intel/urls", response_model=list[RegisteredUrl])
async def get_registered_urls() -> list[RegisteredUrl]:
    return [RegisteredUrl(**u) for u in list_registered_urls()]


@app.patch(
    "/v1/intel/urls/{registered_id}",
    response_model=RegisteredUrl,
    responses={404: {"model": ErrorResponse}},
)
async def patch_registered_url(registered_id: str, req: UpdateFrecuenciaRequest) -> RegisteredUrl:
    updated = update_registered_url(registered_id, frecuencia=req.frecuencia)
    if not updated:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": "URL no encontrada."})
    urls = list_registered_urls()
    entry = next((u for u in urls if u["id"] == registered_id), None)
    return RegisteredUrl(**entry)


@app.delete("/v1/intel/urls/{registered_id}", responses={404: {"model": ErrorResponse}})
async def remove_registered_url(registered_id: str) -> dict[str, str]:
    deleted = delete_registered_url(registered_id)
    if not deleted:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": "URL no encontrada."})
    return {"status": "deleted", "id": registered_id}


@app.post(
    "/v1/intel/urls/{registered_id}/scrape",
    response_model=ScrapeNowResponse,
    responses={404: {"model": ErrorResponse}, 504: {"model": ErrorResponse}},
)
async def scrape_registered_url(registered_id: str) -> ScrapeNowResponse:
    urls = list_registered_urls()
    entry = next((u for u in urls if u["id"] == registered_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": "URL no encontrada."})

    started = time.perf_counter()
    prompt = get_active_prompt()
    loop = asyncio.get_running_loop()

    try:
        page = await asyncio.wait_for(
            loop.run_in_executor(None, fetch_page, entry["url"], settings.scraping_timeout_seconds),
            timeout=settings.scraping_timeout_seconds + 5,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail={"error_code": "SCRAPE_TIMEOUT", "message": "Timeout al scrapear la URL."})
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error_code": "SCRAPE_FAILED", "message": str(exc)})

    extracted = extract(
        page_text=page.get("text", ""),
        page_meta={**(page.get("meta") or {}), "title": page.get("title")},
        user_prompt=prompt,
        settings=settings,
    )
    columns = extracted.get("columns", [])
    rows = extracted.get("rows", [])
    request_id = uuid4()
    saved_id = save_record(
        request_id=request_id,
        url=entry["url"],
        prompt=prompt,
        columns=columns,
        rows=rows,
        user_id=entry.get("cargado_por"),
    )
    mark_url_scraped(registered_id)

    return ScrapeNowResponse(
        registered_id=registered_id,
        url=entry["url"],
        saved_id=saved_id,
        columns=columns,
        rows=rows,
        warnings=extracted.get("warnings", []),
        elapsed_ms=int((time.perf_counter() - started) * 1000),
    )


# ─── Prompt del sistema ───────────────────────────────────────────────────────

@app.get("/v1/sistemas/prompt", response_model=PromptConfig)
async def get_prompt() -> PromptConfig:
    from .storage import _DEFAULT_PROMPT, get_system_config
    value = get_system_config("prompt")
    updated_at = get_system_config("prompt_updated_at")
    return PromptConfig(prompt=value or _DEFAULT_PROMPT, updated_at=updated_at)


@app.put("/v1/sistemas/prompt", response_model=PromptConfig)
async def update_prompt(body: PromptConfig) -> PromptConfig:
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail={"error_code": "INVALID_PROMPT", "message": "El prompt no puede estar vacío."})
    set_system_config("prompt", body.prompt.strip())
    now = datetime.now(timezone.utc).isoformat()
    set_system_config("prompt_updated_at", now)
    return PromptConfig(prompt=body.prompt.strip(), updated_at=now)


# ─── Enriquecimiento Google Maps ──────────────────────────────────────────────

@app.post(
    "/v1/intel/enrich/maps",
    response_model=MapsEnrichResponse,
    responses={400: {"model": ErrorResponse}},
)
async def enrich_maps(req: MapsEnrichRequest) -> MapsEnrichResponse:
    if not settings.google_maps_api_key:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_API_KEY", "message": "GOOGLE_MAPS_API_KEY no configurada."},
        )
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: enrich_with_maps(req.query, settings.google_maps_api_key, req.country_hint),
        )
    except Exception as exc:
        logger.exception("Error enriqueciendo con Maps: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"error_code": "MAPS_ERROR", "message": str(exc)},
        )
    return MapsEnrichResponse(**result)


# ─── Búsqueda de obras por zona ───────────────────────────────────────────────

@app.post(
    "/v1/intel/obras/search",
    response_model=ObrasSearchResponse,
    responses={400: {"model": ErrorResponse}},
)
async def search_obras(req: ObrasSearchRequest) -> ObrasSearchResponse:
    if not settings.google_maps_api_key:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_API_KEY", "message": "GOOGLE_MAPS_API_KEY no configurada."},
        )
    loop = asyncio.get_running_loop()
    try:
        raw = await loop.run_in_executor(
            None,
            lambda: search_obras_nearby(req.lat, req.lng, req.radio_metros, settings.google_maps_api_key),
        )
    except Exception as exc:
        logger.exception("Error buscando obras: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"error_code": "MAPS_ERROR", "message": str(exc)},
        )
    return ObrasSearchResponse(
        lat=req.lat,
        lng=req.lng,
        radio_metros=req.radio_metros,
        total=len(raw),
        results=[ObraResult(**r) for r in raw],
    )


# ─── Enriquecimiento Apollo ───────────────────────────────────────────────────

def _translate_apollo_fields(result: dict) -> dict:
    """Traduce industria, sub_industria y descripcion al español usando el LLM configurado."""
    fields_to_translate = {
        k: result[k] for k in ("industria", "sub_industria", "descripcion")
        if result.get(k)
    }
    if not fields_to_translate:
        return result

    prompt_lines = "\n".join(f"{k}: {v}" for k, v in fields_to_translate.items())
    system = "Sos un traductor. Traducís al español rioplatense de forma concisa y natural. Devolvés SOLO un JSON con las mismas claves traducidas, sin explicaciones."
    user = f"Traducí estos campos al español:\n{prompt_lines}\n\nRespuesta JSON:"

    try:
        if settings.llm_provider == "azure" and settings.azure_openai_endpoint and settings.azure_openai_api_key:
            from openai import AzureOpenAI
            client = AzureOpenAI(
                api_key=settings.azure_openai_api_key,
                api_version=settings.azure_openai_api_version,
                azure_endpoint=settings.azure_openai_endpoint,
            )
            completion = client.chat.completions.create(
                model=settings.azure_openai_deployment,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=0,
                max_tokens=300,
            )
        elif settings.llm_provider == "openai" and settings.openai_api_key:
            from openai import OpenAI
            client = OpenAI(api_key=settings.openai_api_key)
            completion = client.chat.completions.create(
                model=settings.openai_model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=0,
                max_tokens=300,
            )
        else:
            return result

        import json as _json
        raw = completion.choices[0].message.content.strip()
        translated = _json.loads(raw)
        return {**result, **{k: translated[k] for k in fields_to_translate if k in translated}}
    except Exception as exc:
        logger.warning("No se pudo traducir campos de Apollo: %s", exc)
        return result


@app.post(
    "/v1/intel/enrich/apollo/org",
    response_model=ApolloOrgResponse,
    responses={400: {"model": ErrorResponse}},
)
async def enrich_apollo_org(req: ApolloOrgRequest) -> ApolloOrgResponse:
    if not settings.apollo_api_key:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_API_KEY", "message": "APOLLO_API_KEY no configurada."},
        )
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: apollo_enrich_org(req.domain, settings.apollo_api_key),
        )
        if result.get("found"):
            result = await loop.run_in_executor(None, lambda: _translate_apollo_fields(result))
    except Exception as exc:
        logger.exception("Error enriqueciendo org con Apollo: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"error_code": "APOLLO_ERROR", "message": str(exc)},
        )
    return ApolloOrgResponse(**result)


@app.post(
    "/v1/intel/enrich/apollo/people",
    response_model=ApolloPeopleResponse,
    responses={400: {"model": ErrorResponse}},
)
async def enrich_apollo_people(req: ApolloPeopleRequest) -> ApolloPeopleResponse:
    if not settings.apollo_api_key:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_API_KEY", "message": "APOLLO_API_KEY no configurada."},
        )
    if not req.domain and not req.org_name:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "MISSING_PARAM", "message": "Se requiere domain u org_name."},
        )
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: apollo_search_people(
                api_key=settings.apollo_api_key,
                domain=req.domain,
                org_name=req.org_name,
                titulos=req.titulos or None,
                pagina=req.pagina,
                por_pagina=req.por_pagina,
            ),
        )
    except Exception as exc:
        logger.exception("Error buscando personas con Apollo: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"error_code": "APOLLO_ERROR", "message": str(exc)},
        )
    return ApolloPeopleResponse(
        found=result["found"],
        total=result["total"],
        pagina=result["pagina"],
        por_pagina=result["por_pagina"],
        contactos=[ApolloContacto(**c) for c in result["contactos"]],
    )


@app.post(
    "/v1/intel/enrich/apollo/reveal",
    response_model=ApolloRevealResponse,
    responses={400: {"model": ErrorResponse}},
)
async def reveal_apollo_contact(req: ApolloRevealRequest) -> ApolloRevealResponse:
    """Revela datos completos de un contacto Apollo usando 1 crédito."""
    if not settings.apollo_api_key:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_API_KEY", "message": "APOLLO_API_KEY no configurada."},
        )
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: apollo_reveal_contact(req.apollo_id, settings.apollo_api_key),
        )
    except Exception as exc:
        logger.exception("Error revelando contacto Apollo: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"error_code": "APOLLO_ERROR", "message": str(exc)},
        )
    return ApolloRevealResponse(**result)


# ─── AFIP ─────────────────────────────────────────────────────────────────────

@app.post(
    "/v1/intel/enrich/afip",
    response_model=AfipResponse,
    responses={400: {"model": ErrorResponse}},
)
async def enrich_afip(req: AfipRequest) -> AfipResponse:
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(None, lambda: enrich_with_afip(req.cuit))
    except Exception as exc:
        logger.exception("Error consultando AFIP: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"error_code": "AFIP_ERROR", "message": str(exc)},
        )
    domicilio = result.pop("domicilio", None)
    return AfipResponse(
        **result,
        domicilio=AfipDomicilio(**domicilio) if domicilio else None,
    )


# ─── Hunter.io ────────────────────────────────────────────────────────────────

@app.post(
    "/v1/intel/enrich/hunter",
    response_model=HunterResponse,
    responses={400: {"model": ErrorResponse}},
)
async def enrich_hunter(req: HunterRequest) -> HunterResponse:
    if not settings.hunter_api_key:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_API_KEY", "message": "HUNTER_API_KEY no configurada."},
        )
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: hunter_search(req.domain, settings.hunter_api_key),
        )
    except Exception as exc:
        logger.exception("Error buscando emails con Hunter: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"error_code": "HUNTER_ERROR", "message": str(exc)},
        )
    emails = result.pop("emails", [])
    return HunterResponse(
        **result,
        emails=[HunterEmail(**e) for e in emails],
    )


# ─── Export CSV ───────────────────────────────────────────────────────────────

@app.get("/v1/intel/records/export")
async def export_records_csv(
    q: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    limit: int = Query(default=500, le=2000),
):
    """Exporta registros guardados como CSV para importar a CRM."""
    import csv, io

    rows_db = storage.list_records(limit=limit, offset=0, user_id=user_id, q=q)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["saved_id", "url", "dominio", "fecha", "usuario", "registros"])

    for rec in rows_db:
        domain = ""
        try:
            from urllib.parse import urlparse
            domain = urlparse(rec["url"]).hostname or ""
            domain = domain.replace("www.", "")
        except Exception:
            pass
        writer.writerow([
            rec["saved_id"],
            rec["url"],
            domain,
            rec["created_at"],
            rec.get("user_id") or "",
            rec.get("row_count", ""),
        ])

    from fastapi.responses import StreamingResponse
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leiten-intel-export.csv"},
    )
