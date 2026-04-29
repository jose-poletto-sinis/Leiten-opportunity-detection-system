"""
API HTTP que expone el flujo de scraping inteligente.

Endpoints:
  POST /v1/intel/scrape          -> URL única (retrocompatibilidad)
  POST /v1/intel/scrape-batch    -> hasta 50 URLs en paralelo controlado
  POST /v1/intel/save            -> persiste un resultado
  POST /v1/intel/save-batch      -> persiste todos los resultados de un batch
  POST /v1/intel/discard         -> registra descarte
  GET  /v1/intel/records         -> historial paginado
  GET  /v1/intel/records/{id}    -> detalle de un registro
  DELETE /v1/intel/records/{id}  -> eliminar registro
  GET  /healthz                  -> health probe para Azure
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .extractor import extract
from .models import (
    BatchSaveRequest,
    BatchSaveResponse,
    BatchScrapeItemResponse,
    BatchScrapeResponse,
    ErrorResponse,
    MultiScrapeRequest,
    RecordDetail,
    RecordsResponse,
    SaveRequest,
    SaveResponse,
    ScrapeRequest,
    ScrapeResponse,
)
from .runner import fetch_page
from .storage import delete_record, get_record, list_records, log_audit, save_record

settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s [%(levelname)s] %(name)s :: %(message)s",
)
logger = logging.getLogger(settings.service_name)

app = FastAPI(
    title="Leiten Intel Scraper",
    version="0.1.0",
    description=(
        "Servicio de scraping inteligente para identificar oportunidades de negocio "
        "sobre empresas, obras y desarrolladoras."
    ),
)

# CORS abierto a la app interna. En Azure restringir a los dominios de Leiten.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}


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
    response = ScrapeResponse(
        request_id=request_id,
        url=str(req.url),
        prompt=req.prompt,
        columns=extracted.get("columns", []),
        rows=extracted.get("rows", []),
        warnings=extracted.get("warnings", []),
        elapsed_ms=elapsed_ms,
        extracted_at=datetime.now(timezone.utc),
    )

    log_audit(
        request_id=request_id,
        action="response",
        url=str(req.url),
        prompt=req.prompt,
        user_id=req.user_id,
        payload={"rows": len(response.rows), "elapsed_ms": elapsed_ms},
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
        log_audit(
            request_id=request_id,
            action="response",
            url=url,
            prompt=prompt,
            user_id=user_id,
            payload={"rows": len(extracted.get("rows", [])), "elapsed_ms": elapsed_ms},
        )

        return BatchScrapeItemResponse(
            request_id=request_id,
            url=url,
            status="ok",
            columns=extracted.get("columns", []),
            rows=extracted.get("rows", []),
            warnings=extracted.get("warnings", []),
            elapsed_ms=elapsed_ms,
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
