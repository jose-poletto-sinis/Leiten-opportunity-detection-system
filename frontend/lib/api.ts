/**
 * Cliente HTTP del backend (FastAPI / endpoint Azure).
 *
 * El contrato del endpoint está documentado en docs/azure-endpoint-contract.md.
 * Si integraciones cambia el path o el shape, ajustar acá y en types.ts.
 */

import type {
  AfipResponse,
  ApolloOrgResponse,
  ApolloPeopleResponse,
  ApolloRevealResponse,
  BatchSaveRequest,
  BatchSaveResponse,
  BatchScrapeRequest,
  BatchScrapeResponse,
  Frecuencia,
  ObrasSearchRequest,
  ObrasSearchResponse,
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

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("leiten_intel_token");
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("leiten_intel_token");
  localStorage.removeItem("leiten_intel_user");
  window.location.href = "/login";
}

async function parseError(res: Response, path: string): Promise<never> {
  if (res.status === 401) {
    handleUnauthorized();
  }
  let payload: any = null;
  try { payload = await res.json(); } catch { /* vacío */ }
  const detail = payload?.detail ?? payload ?? {};
  throw new ApiError(
    res.status,
    detail.error_code ?? `HTTP_${res.status}`,
    detail.message ?? `Error ${res.status} al llamar a ${path}`,
    detail.details,
  );
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return parseError(res, path);
  return (await res.json()) as T;
}

async function getJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), { method: "GET", headers: authHeaders() });
  if (!res.ok) return parseError(res, path);
  return (await res.json()) as T;
}

async function deleteJson<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), { method: "DELETE", headers: authHeaders() });
  if (!res.ok) return parseError(res, path);
  return (await res.json()) as T;
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res, path);
  return (await res.json()) as T;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  session_id: string;
  cod_usr: string;
  nom_usr: string;
  expires_in_minutes: number;
}

export function login(cod_usr: string, password: string) {
  return postJson<LoginResponse>("/v1/auth/login", { cod_usr, password });
}

export function logout() {
  return postJson<{ status: string }>("/v1/auth/logout", {});
}

export function getMe() {
  return getJson<{ session_id: string; cod_usr: string; nom_usr: string }>("/v1/auth/me");
}

// ─────────────────────────────────────────────────────────────────────────────

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

// ─── URLs registradas ────────────────────────────────────────────────────────

export function getRegisteredUrls() {
  return getJson<RegisteredUrl[]>("/v1/intel/urls");
}

export function registerUrl(req: RegisterUrlRequest) {
  return postJson<RegisteredUrl>("/v1/intel/urls", req);
}

export function updateFrecuencia(id: string, frecuencia: Frecuencia) {
  return patchJson<RegisteredUrl>(`/v1/intel/urls/${id}`, { frecuencia });
}

export function deleteRegisteredUrl(id: string) {
  return deleteJson<{ status: string; id: string }>(`/v1/intel/urls/${id}`);
}

export function scrapeRegisteredUrl(id: string) {
  return postJson<ScrapeNowResponse>(`/v1/intel/urls/${id}/scrape`, {});
}

// ─── Prompt del sistema ───────────────────────────────────────────────────────

export function getPrompt() {
  return getJson<PromptConfig>("/v1/sistemas/prompt");
}

export async function updatePrompt(prompt: string): Promise<PromptConfig> {
  const res = await fetch(`${API_BASE}/v1/sistemas/prompt`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) return parseError(res, "/v1/sistemas/prompt");
  return res.json();
}

// ─── Enriquecimiento Maps ────────────────────────────────────────────────────

export function enrichWithMaps(query: string) {
  return postJson<import("./types").MapsEnrichResponse>("/v1/intel/enrich/maps", { query, country_hint: "AR" });
}

export function searchObras(req: ObrasSearchRequest) {
  return postJson<ObrasSearchResponse>("/v1/intel/obras/search", req);
}

// ─── Enriquecimiento Apollo ──────────────────────────────────────────────────

export function enrichApolloOrg(domain: string) {
  return postJson<ApolloOrgResponse>("/v1/intel/enrich/apollo/org", { domain });
}

export function searchApolloPeople(params: {
  domain?: string;
  org_name?: string;
  titulos?: string[];
  pagina?: number;
  por_pagina?: number;
}) {
  return postJson<ApolloPeopleResponse>("/v1/intel/enrich/apollo/people", params);
}

export function revealApolloContact(apollo_id: string) {
  return postJson<ApolloRevealResponse>("/v1/intel/enrich/apollo/reveal", { apollo_id });
}

export function enrichWithAfip(cuit: string) {
  return postJson<AfipResponse>("/v1/intel/enrich/afip", { cuit });
}

export function exportRecordsCsv(params?: { q?: string }) {
  const url = new URL(`${API_BASE}/v1/intel/records/export`);
  if (params?.q) url.searchParams.set("q", params.q);
  window.open(url.toString(), "_blank");
}

export { ApiError };
