"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ResultsTable } from "../../components/ResultsTable";
import {
  ApiError,
  deleteRegisteredUrl,
  getRegisteredUrls,
  registerUrl,
  scrapeRegisteredUrl,
  updateFrecuencia,
} from "../../lib/api";
import type { Frecuencia, RegisteredUrl, ScrapeNowResponse } from "../../lib/types";
import { isValidUrl } from "../../lib/validators";

export default function IntelPage() {
  const [urls, setUrls] = useState<RegisteredUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulario de nueva URL
  const [newUrl, setNewUrl] = useState("");
  const [newUrlError, setNewUrlError] = useState<string | null>(null);
  const [newFrecuencia, setNewFrecuencia] = useState<Frecuencia>("semanal");
  const [submitting, setSubmitting] = useState(false);

  // Scrape manual en curso
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeNowResponse | null>(null);

  async function fetchUrls() {
    setLoading(true);
    try {
      setUrls(await getRegisteredUrls());
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUrls(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newUrl.trim();
    if (!trimmed) { setNewUrlError("Ingresá una URL."); return; }
    if (!isValidUrl(trimmed)) { setNewUrlError("URL inválida."); return; }
    setNewUrlError(null);
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const created = await registerUrl({ url: trimmed, frecuencia: newFrecuencia, cargado_por: getUserHint() });
      setUrls((prev) => [created, ...prev]);
      setNewUrl("");
      setSuccessMsg(`URL registrada con scraping ${newFrecuencia}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRegisteredUrl(id);
      setUrls((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setErrorMsg(formatErr(err));
    }
  }

  async function handleFrecuenciaChange(id: string, frecuencia: Frecuencia) {
    try {
      const updated = await updateFrecuencia(id, frecuencia);
      setUrls((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      setErrorMsg(formatErr(err));
    }
  }

  async function handleScrapeNow(id: string) {
    setScrapingId(id);
    setScrapeResult(null);
    setErrorMsg(null);
    try {
      const result = await scrapeRegisteredUrl(id);
      setScrapeResult(result);
      setUrls((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, fecha_ultimo_scraping: new Date().toISOString() } : u
        )
      );
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setScrapingId(null);
    }
  }

  return (
    <main className="page">
      <header className="page__header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page__title">URLs monitoreadas</h1>
            <p className="page__subtitle">
              Registrá sitios web para que el sistema los analice automáticamente según la frecuencia elegida.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/resultados" className="btn btn--ghost" style={{ whiteSpace: "nowrap" }}>
              Ver resultados →
            </Link>
            <Link href="/intel/historial" className="btn btn--ghost" style={{ whiteSpace: "nowrap" }}>
              Historial
            </Link>
          </div>
        </div>
      </header>

      {successMsg && (
        <div className="banner banner--success" role="status">{successMsg}</div>
      )}
      {errorMsg && (
        <div className="banner banner--error" role="alert">
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Formulario de alta */}
      <form className="card" onSubmit={handleAdd} noValidate>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <input
              className="input"
              type="text"
              placeholder="https://www.empresa.com/contacto"
              value={newUrl}
              onChange={(e) => { setNewUrl(e.target.value); setNewUrlError(null); }}
              aria-invalid={newUrlError !== null}
              disabled={submitting}
              style={{ width: "100%" }}
            />
            {newUrlError && <span className="field__error">{newUrlError}</span>}
          </div>
          <select
            className="input"
            value={newFrecuencia}
            onChange={(e) => setNewFrecuencia(e.target.value as Frecuencia)}
            disabled={submitting}
            style={{ width: 130, flexShrink: 0 }}
          >
            <option value="diaria">Diaria</option>
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
          </select>
          <button type="submit" className="btn" disabled={submitting} style={{ flexShrink: 0 }}>
            {submitting ? "Guardando..." : "Agregar URL"}
          </button>
        </div>
      </form>

      {/* Tabla de URLs registradas */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="loader" style={{ padding: 24 }}>
            <span className="loader__spinner" aria-hidden="true" />
            <span>Cargando...</span>
          </div>
        ) : urls.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            No hay URLs registradas todavía. Agregá la primera arriba.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">URL</th>
                  <th scope="col">Frecuencia</th>
                  <th scope="col">Último scraping</th>
                  <th scope="col" style={{ width: 180 }}></th>
                </tr>
              </thead>
              <tbody>
                {urls.map((u) => (
                  <UrlRow
                    key={u.id}
                    item={u}
                    scraping={scrapingId === u.id}
                    onDelete={handleDelete}
                    onFrecuenciaChange={handleFrecuenciaChange}
                    onScrapeNow={handleScrapeNow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resultado del scrape manual */}
      {scrapeResult && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p className="meta-line" style={{ margin: 0 }}>
              Resultado de <a href={scrapeResult.url} target="_blank" rel="noreferrer">{scrapeResult.url}</a>
              {" · "}{scrapeResult.elapsed_ms} ms
            </p>
            <button type="button" className="btn btn--ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setScrapeResult(null)}>
              Cerrar
            </button>
          </div>
          {scrapeResult.warnings.length > 0 && (
            <div className="banner banner--warning" style={{ marginBottom: 12 }}>
              {scrapeResult.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
          {scrapeResult.rows.length === 0 ? (
            <div className="empty-state">No se encontraron datos en esta página.</div>
          ) : (
            <ResultsTable columns={scrapeResult.columns} rows={scrapeResult.rows} />
          )}
        </div>
      )}
    </main>
  );
}

function UrlRow({
  item,
  scraping,
  onDelete,
  onFrecuenciaChange,
  onScrapeNow,
}: {
  item: RegisteredUrl;
  scraping: boolean;
  onDelete: (id: string) => void;
  onFrecuenciaChange: (id: string, f: Frecuencia) => void;
  onScrapeNow: (id: string) => void;
}) {
  const lastScraping = item.fecha_ultimo_scraping
    ? new Date(item.fecha_ultimo_scraping).toLocaleString("es-AR", {
        day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  return (
    <tr>
      <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <a href={item.url} target="_blank" rel="noreferrer" title={item.url}>{item.url}</a>
      </td>
      <td>
        <select
          className="input"
          value={item.frecuencia}
          onChange={(e) => onFrecuenciaChange(item.id, e.target.value as Frecuencia)}
          style={{ fontSize: 13, padding: "2px 6px", height: "auto" }}
        >
          <option value="diaria">Diaria</option>
          <option value="semanal">Semanal</option>
          <option value="mensual">Mensual</option>
        </select>
      </td>
      <td style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{lastScraping}</td>
      <td>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: "3px 10px" }}
            onClick={() => onScrapeNow(item.id)}
            disabled={scraping}
          >
            {scraping ? "Analizando..." : "Analizar ahora"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: 12, padding: "3px 8px", color: "var(--danger)" }}
            onClick={() => onDelete(item.id)}
            disabled={scraping}
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

function formatErr(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error desconocido.";
}

function getUserHint(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem("intel:user_id") ?? undefined;
}
