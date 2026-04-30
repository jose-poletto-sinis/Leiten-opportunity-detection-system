/**
 * Schemas compartidos con el backend FastAPI (ver backend/app/models.py).
 *
 * Mantener estos tipos en sync con los Pydantic models. Si integraciones
 * decide cambiar el contrato Azure, actualizar SOLO acá y en api.ts.
 */

export interface ScrapeRequest {
  url: string;
  prompt: string;
  user_id?: string;
}

export interface ScrapeResponse {
  request_id: string;
  url: string;
  prompt: string;
  columns: string[];
  rows: Record<string, unknown>[];
  extracted_at: string;
  elapsed_ms: number;
  warnings: string[];
}

export interface BatchScrapeRequest {
  urls: string[];
  prompt: string;
  user_id?: string;
}

export interface BatchScrapeItemResponse {
  request_id: string;
  url: string;
  status: "ok" | "error";
  columns: string[];
  rows: Record<string, unknown>[];
  warnings: string[];
  elapsed_ms: number;
  error_message?: string;
}

export interface BatchScrapeResponse {
  results: BatchScrapeItemResponse[];
  prompt: string;
  total_urls: number;
  ok_count: number;
  error_count: number;
}

export interface SaveRequest {
  request_id: string;
  url: string;
  prompt: string;
  columns: string[];
  rows: Record<string, unknown>[];
  user_id?: string;
}

export interface SaveResponse {
  saved_id: string;
  persisted_rows: number;
  message: string;
}

export interface BatchSaveItem {
  request_id: string;
  url: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface BatchSaveRequest {
  results: BatchSaveItem[];
  prompt: string;
  user_id?: string;
}

export interface BatchSaveResponse {
  saved_ids: string[];
  total_persisted_rows: number;
  message: string;
}

export interface RecordSummary {
  saved_id: string;
  request_id: string;
  url: string;
  prompt: string;
  row_count: number;
  user_id: string | null;
  status: string;
  created_at: string;
}

export interface RecordDetail {
  saved_id: string;
  request_id: string;
  url: string;
  prompt: string;
  columns: string[];
  rows: Record<string, unknown>[];
  user_id: string | null;
  status: string;
  created_at: string;
}

export interface RecordsResponse {
  items: RecordSummary[];
  total: number;
  limit: number;
  offset: number;
}
