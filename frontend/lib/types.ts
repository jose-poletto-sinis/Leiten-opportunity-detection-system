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

export type Frecuencia = "diaria" | "semanal" | "mensual";

export interface RegisteredUrl {
  id: string;
  nombre: string | null;
  url: string;
  cargado_por: string | null;
  frecuencia: Frecuencia;
  prompt: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_ultimo_scraping: string | null;
  created_at: string;
}

export interface RegisterUrlRequest {
  url: string;
  nombre?: string;
  cargado_por?: string;
  frecuencia: Frecuencia;
  prompt?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
}

export interface ScrapeNowResponse {
  registered_id: string;
  url: string;
  saved_id: string | null;
  columns: string[];
  rows: Record<string, unknown>[];
  warnings: string[];
  elapsed_ms: number;
}

export interface PromptConfig {
  prompt: string;
  updated_at: string | null;
}

export interface MapsEnrichResponse {
  found: boolean;
  query: string;
  place_id: string | null;
  nombre: string | null;
  direccion: string | null;
  telefono: string | null;
  telefono_intl: string | null;
  web: string | null;
  maps_url: string | null;
  categorias: string[];
  estado: string | null;
  rating: number | null;
  total_reviews: number | null;
}

export interface ObraResult {
  place_id: string;
  nombre: string;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  categorias: string[];
  rating: number | null;
  total_reviews: number | null;
  estado: string | null;
  maps_url: string | null;
}

export interface ObrasSearchRequest {
  lat: number;
  lng: number;
  radio_metros: number;
}

export interface ObrasSearchResponse {
  lat: number;
  lng: number;
  radio_metros: number;
  total: number;
  results: ObraResult[];
}

export interface ApolloOrgResponse {
  found: boolean;
  domain: string;
  nombre: string | null;
  sitio_web: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  telefono: string | null;
  industria: string | null;
  sub_industria: string | null;
  empleados: number | null;
  rango_empleados: string | null;
  pais: string | null;
  estado_provincia: string | null;
  ciudad: string | null;
  descripcion: string | null;
  tecnologias: string[];
  palabras_clave: string[];
  ingresos_anuales: number | null;
  rango_ingresos: string | null;
  fundacion: number | null;
  apollo_id: string | null;
}

export interface ApolloContacto {
  nombre: string | null;
  primer_nombre: string | null;
  apellido: string | null;
  titulo: string | null;
  email: string | null;
  email_estado: string | null;
  linkedin_url: string | null;
  telefono: string | null;
  ciudad: string | null;
  estado_provincia: string | null;
  pais: string | null;
  empresa: string | null;
  empresa_dominio: string | null;
  apollo_id: string | null;
}

export interface ApolloPeopleResponse {
  found: boolean;
  total: number;
  pagina: number;
  por_pagina: number;
  contactos: ApolloContacto[];
}

export interface ApolloRevealResponse {
  found: boolean;
  apollo_id: string;
  nombre: string | null;
  primer_nombre: string | null;
  apellido: string | null;
  titulo: string | null;
  email: string | null;
  email_estado: string | null;
  emails_personales: string[];
  telefono: string | null;
  linkedin_url: string | null;
  foto_url: string | null;
  ciudad: string | null;
  pais: string | null;
  empresa: string | null;
}

export interface AfipDomicilio {
  calle: string | null;
  localidad: string | null;
  provincia: string | null;
  codigo_postal: string | null;
}

export interface AfipResponse {
  found: boolean;
  cuit: string;
  error?: string | null;
  razon_social: string | null;
  tipo_persona: string | null;
  estado: string | null;
  actividad_principal: string | null;
  domicilio: AfipDomicilio | null;
  impuestos: string[];
  fecha_inicio_actividades: string | null;
}

