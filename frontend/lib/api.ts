/**
 * Cliente HTTP del backend (FastAPI / endpoint Azure).
 *
 * El contrato del endpoint está documentado en docs/azure-endpoint-contract.md.
 * Si integraciones cambia el path o el shape, ajustar acá y en types.ts.
 */

import type {
  BatchSaveRequest,
  BatchSaveResponse,
  BatchScrapeRequest,
  BatchScrapeResponse,
  RecordDetail,
  RecordsResponse,
  SaveRequest,
  SaveResponse,
  ScrapeRequest,
  ScrapeResponse,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_INTEL_API_URL || "http://localhost:8080";

class ApiError extends Error {
  constructor(
    public status: number,
    public errorCode: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      // body vacío o no-JSON
    }
    const detail = payload?.detail ?? payload ?? {};
    throw new ApiError(
      res.status,
      detail.error_code ?? `HTTP_${res.status}`,
      detail.message ?? `Error ${res.status} al llamar a ${path}`,
      detail.details,
    );
  }

  return (await res.json()) as T;
}

async function getJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }

  const res = await fetch(url.toString(), { method: "GET" });

  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      // body vacío o no-JSON
    }
    const detail = payload?.detail ?? payload ?? {};
    throw new ApiError(
      res.status,
      detail.error_code ?? `HTTP_${res.status}`,
      detail.message ?? `Error ${res.status} al llamar a ${path}`,
      detail.details,
    );
  }

  return (await res.json()) as T;
}

async function deleteJson<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), { method: "DELETE" });

  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      // body vacío o no-JSON
    }
    const detail = payload?.detail ?? payload ?? {};
    throw new ApiError(
      res.status,
      detail.error_code ?? `HTTP_${res.status}`,
      detail.message ?? `Error ${res.status} al llamar a ${path}`,
      detail.details,
    );
  }

  return (await res.json()) as T;
}

export function scrape(req: ScrapeRequest, signal?: AbortSignal) {
  return postJson<ScrapeResponse>("/v1/intel/scrape", req, signal);
}

export function scrapeBatch(req: BatchScrapeRequest, signal?: AbortSignal) {
  return postJson<BatchScrapeResponse>("/v1/intel/scrape-batch", req, signal);
}

export function saveRecord(req: SaveRequest) {
  return postJson<SaveResponse>("/v1/intel/save", req);
}

export function saveBatch(req: BatchSaveRequest) {
  return postJson<BatchSaveResponse>("/v1/intel/save-batch", req);
}

export function discardRecord(req: SaveRequest) {
  return postJson<{ status: string }>("/v1/intel/discard", req);
}

export function getRecords(params: {
  limit?: number;
  offset?: number;
  user_id?: string;
  q?: string;
}) {
  return getJson<RecordsResponse>("/v1/intel/records", params as Record<string, string | number | undefined>);
}

export function getRecordDetail(savedId: string) {
  return getJson<RecordDetail>(`/v1/intel/records/${savedId}`);
}

export function deleteRecordById(savedId: string, userId?: string) {
  return deleteJson<{ status: string; saved_id: string }>(
    `/v1/intel/records/${savedId}`,
    userId ? { user_id: userId } : undefined,
  );
}

export { ApiError };
