"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ResultsTable } from "../../components/ResultsTable";
import {
  ApiError,
  deleteRegisteredUrl,
  getPrompt,
  getRecordDetail,
  getRecords,
  getRegisteredUrls,
  registerUrl,
  scrape,
  scrapeRegisteredUrl,
  updateFrecuencia,
  updateRegisteredUrl,
} from "../../lib/api";
import type {
  Frecuencia,
  RecordDetail,
  RecordSummary,
  RecordsResponse,
  RegisteredUrl,
  ScrapeNowResponse,
  ScrapeResponse,
} from "../../lib/types";
import { isValidUrl } from "../../lib/validators";

type Tab = "urls" | "test" | "historial";

const TAB_LABELS: Record<Tab, string> = { urls: "URLs", test: "Test", historial: "Historial" };

function IntelPageInner() {
  return (
    <main className="page">
      <header className="page__header">
        <p className="page__subtitle">
          Registrá sitios web para que el sistema los analice automáticamente según la frecuencia elegida.
        </p>
      </header>
      <UrlsTab />
    </main>
  );
}

export default function IntelPage() {
  return (
    <Suspense>
      <IntelPageInner />
    </Suspense>
  );
}

// ─── URLs Tab ────────────────────────────────────────────────────────────────

function UrlsTab() {
  const [urls, setUrls] = useState<RegisteredUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [newNombre, setNewNombre] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newUrlError, setNewUrlError] = useState<string | null>(null);
  const [newFrecuencia, setNewFrecuencia] = useState<Frecuencia>("semanal");
  const [newFechaInicio, setNewFechaInicio] = useState("");
  const [newFechaFin, setNewFechaFin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptText, setPromptText] = useState("");
  const [formOpen, setFormOpen] = useState(false);

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

  useEffect(() => {
    fetchUrls();
    getPrompt().then((cfg) => setSystemPrompt(cfg.prompt)).catch(() => {});
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newUrl.trim();
    if (!trimmed) { setNewUrlError("Ingresá una URL."); return; }
    if (!isValidUrl(trimmed)) { setNewUrlError("URL inválida."); return; }
    setNewUrlError(null);
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const created = await registerUrl({
        url: trimmed,
        nombre: newNombre.trim() || undefined,
        frecuencia: newFrecuencia,
        cargado_por: getUserHint(),
        fecha_inicio: newFechaInicio || undefined,
        fecha_fin: newFechaFin || undefined,
        prompt: promptText || undefined,
      });
      setUrls((prev) => [{ ...created, prompt: (created.prompt ?? promptText) || null }, ...prev]);
      setNewNombre("");
      setNewUrl("");
      setNewFechaInicio("");
      setNewFechaFin("");
      setPromptText("");
      setFormOpen(false);
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

  async function handleUpdate(id: string, fields: { nombre?: string | null; url?: string; frecuencia?: Frecuencia; prompt?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null }) {
    try {
      const updated = await updateRegisteredUrl(id, fields);
      setUrls((prev) => prev.map((u) => (u.id === id ? updated : u)));
      setEditingId(null);
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
    <>
      {successMsg && <div className="banner banner--success" role="status">{successMsg}</div>}
      {errorMsg && (
        <div className="banner banner--error" role="alert">
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="btn"
          onClick={() => setFormOpen((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, padding: "8px 18px" }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>{formOpen ? "−" : "+"}</span>
          Agregar nueva URL
        </button>
      </div>

      {formOpen && (
        <form className="card" onSubmit={handleAdd} noValidate style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              className="input"
              type="text"
              placeholder="Nombre (ej: Nocito Constructora)"
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              disabled={submitting}
              style={{ width: "100%" }}
            />
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
              <input className="input" type="date" value={newFechaInicio} onChange={(e) => setNewFechaInicio(e.target.value)} disabled={submitting} style={{ width: 140, flexShrink: 0 }} title="Fecha inicio" />
              <input className="input" type="date" value={newFechaFin} onChange={(e) => setNewFechaFin(e.target.value)} disabled={submitting} style={{ width: 140, flexShrink: 0 }} title="Fecha fin" />
              <select className="input" value={newFrecuencia} onChange={(e) => setNewFrecuencia(e.target.value as Frecuencia)} disabled={submitting} style={{ width: 130, flexShrink: 0 }}>
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="field__label" htmlFor="prompt-inline">Instrucciones para el scraping</label>
              <textarea
                id="prompt-inline"
                className="textarea"
                value={promptText}
                placeholder={systemPrompt || "Si no escribís nada se usa el prompt del sistema..."}
                onChange={(e) => setPromptText(e.target.value)}
                rows={4}
                style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Guardando..." : "Agregar URL"}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)} disabled={submitting}>
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}

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
                  <th scope="col">Inicio</th>
                  <th scope="col">Fin</th>
                  <th scope="col">Último scraping</th>
                  <th scope="col" style={{ width: 200 }}></th>
                </tr>
              </thead>
              <tbody>
                {urls.map((u) => (
                  <UrlRow
                    key={u.id}
                    item={u}
                    globalPrompt={systemPrompt}
                    scraping={scrapingId === u.id}
                    editing={editingId === u.id}
                    onEdit={() => setEditingId(u.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onDelete={handleDelete}
                    onFrecuenciaChange={handleFrecuenciaChange}
                    onScrapeNow={handleScrapeNow}
                    onUpdate={handleUpdate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

    </>
  );
}

// ─── Test Tab ─────────────────────────────────────────────────────────────────

function TestTab() {
  const [testUrl, setTestUrl] = useState("");
  const [testUrlError, setTestUrlError] = useState<string | null>(null);
  const [testPrompt, setTestPrompt] = useState("");
  const [testPromptError, setTestPromptError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ScrapeResponse | null>(null);
  const [testErrorMsg, setTestErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    const url = testUrl.trim();
    const prompt = testPrompt.trim();
    if (!url) { setTestUrlError("Ingresá una URL."); return; }
    if (!isValidUrl(url)) { setTestUrlError("URL inválida."); return; }
    if (!prompt) { setTestPromptError("Describí qué información querés extraer."); return; }
    setTestUrlError(null);
    setTestPromptError(null);
    setTesting(true);
    setTestResult(null);
    setTestErrorMsg(null);
    abortRef.current = new AbortController();
    try {
      const result = await scrape({ url, prompt }, abortRef.current.signal);
      setTestResult(result);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setTestErrorMsg(formatErr(err));
    } finally {
      setTesting(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <>
      {testErrorMsg && (
        <div className="banner banner--error" role="alert">
          {testErrorMsg}
          <button type="button" onClick={() => setTestErrorMsg(null)} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      <form className="card" onSubmit={handleTest} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <input
              className="input"
              type="text"
              placeholder="https://www.empresa.com/contacto"
              value={testUrl}
              onChange={(e) => { setTestUrl(e.target.value); setTestUrlError(null); }}
              aria-invalid={testUrlError !== null}
              disabled={testing}
              style={{ width: "100%" }}
            />
            {testUrlError && <span className="field__error">{testUrlError}</span>}
          </div>
          <div>
            <textarea
              className="input"
              placeholder="Ej: Extraé el nombre de la empresa, dirección y teléfono de contacto."
              value={testPrompt}
              onChange={(e) => { setTestPrompt(e.target.value); setTestPromptError(null); }}
              aria-invalid={testPromptError !== null}
              disabled={testing}
              rows={3}
              style={{ width: "100%", resize: "vertical" }}
            />
            {testPromptError && <span className="field__error">{testPromptError}</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn" disabled={testing}>
              {testing ? "Analizando..." : "Analizar"}
            </button>
            {testing && (
              <button type="button" className="btn btn--ghost" onClick={handleCancel}>
                Cancelar
              </button>
            )}
          </div>
        </div>
      </form>

      {testResult && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p className="meta-line" style={{ margin: 0 }}>
              <a href={testResult.url} target="_blank" rel="noreferrer">{testResult.url}</a>
              {" · "}{testResult.elapsed_ms} ms
            </p>
            <button type="button" className="btn btn--ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setTestResult(null)}>
              Cerrar
            </button>
          </div>
          {testResult.warnings.length > 0 && (
            <div className="banner banner--warning" style={{ marginBottom: 12 }}>
              {testResult.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
          {testResult.rows.length === 0 ? (
            <div className="empty-state">No se encontraron datos en esta página.</div>
          ) : (
            <ResultsTable columns={testResult.columns} rows={testResult.rows} />
          )}
        </div>
      )}
    </>
  );
}

// ─── Historial Tab ────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function HistorialTab() {
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await getRecords({ limit: PAGE_SIZE, offset, q: search || undefined });
      setData(result);
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setLoading(false);
    }
  }, [offset, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
  }

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <>
      {errorMsg && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: 12 }}>
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)}
            style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
            ✕
          </button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <input className="input" type="text" placeholder="Buscar por URL o prompt..."
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)} style={{ flex: 1 }} />
          <button type="submit" className="btn">Buscar</button>
          {search && (
            <button type="button" className="btn btn--ghost" onClick={() => { setSearchInput(""); setSearch(""); setOffset(0); }}>
              Limpiar
            </button>
          )}
        </form>
      </div>

      {loading ? (
        <div className="loader" style={{ padding: 32 }} role="status">
          <span className="loader__spinner" aria-hidden="true" />
          <span>Cargando historial...</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="empty-state" style={{ padding: 32 }}>
          {search ? `Sin resultados para "${search}".` : "No hay registros guardados todavía."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.items.map((item) => (
            <ExtractionCard key={item.saved_id} item={item} />
          ))}
        </div>
      )}

      {total > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span className="meta-line">{from}–{to} de {total}</span>
          <div className="button-row" style={{ margin: 0 }}>
            <button className="btn btn--ghost" disabled={offset === 0} onClick={() => setOffset(offset - PAGE_SIZE)}>
              ← Anterior
            </button>
            <button className="btn btn--ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ExtractionCard({ item }: { item: RecordSummary }) {
  const [expanded, setExpanded] = useState(true);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setDetailLoading(true);
    getRecordDetail(item.saved_id)
      .then(setDetail)
      .catch((err) => setDetailError(formatErr(err)))
      .finally(() => setDetailLoading(false));
  }, [item.saved_id]);

  const date = new Date(item.created_at).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          cursor: "pointer", userSelect: "none",
          borderBottom: expanded ? "1px solid #e5e7eb" : "none",
          background: expanded ? "#fafafa" : "white",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>{date}</span>
        <StatusBadge status={item.status} />
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          title={item.url}
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}
        >
          {item.url}
        </a>
        <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
          {item.row_count} {item.row_count === 1 ? "fila" : "filas"}
        </span>
        <button
          type="button"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#9ca3af", fontSize: 16, lineHeight: 1, padding: 4,
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.2s",
          }}
          aria-label={expanded ? "Colapsar" : "Expandir"}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        >
          ▾
        </button>
      </div>

      {expanded && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #e5e7eb", background: "#fafafa" }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>{item.prompt}</span>
        </div>
      )}

      {expanded && (
        <div style={{ padding: 0 }}>
          {detailLoading ? (
            <div className="loader" style={{ padding: 20 }} role="status">
              <span className="loader__spinner" aria-hidden="true" />
              <span>Cargando datos...</span>
            </div>
          ) : detailError ? (
            <div className="banner banner--error" style={{ margin: 12 }}>{detailError}</div>
          ) : detail ? (
            <ResultsTable columns={detail.columns} rows={detail.rows} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPendiente = status === "pendiente";
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 11, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap",
      background: isPendiente ? "#fef3c7" : "#dcfce7",
      color: isPendiente ? "#92400e" : "#15803d",
    }}>
      {status}
    </span>
  );
}

// ─── UrlRow ───────────────────────────────────────────────────────────────────

function UrlRow({
  item,
  globalPrompt,
  scraping,
  editing,
  onEdit,
  onCancelEdit,
  onDelete,
  onFrecuenciaChange,
  onScrapeNow,
  onUpdate,
}: {
  item: RegisteredUrl;
  globalPrompt: string;
  scraping: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onFrecuenciaChange: (id: string, f: Frecuencia) => void;
  onScrapeNow: (id: string) => void;
  onUpdate: (id: string, fields: { nombre?: string | null; url?: string; frecuencia?: Frecuencia; prompt?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null }) => void;
}) {
  const [editNombre, setEditNombre] = useState(item.nombre ?? "");
  const [editUrl, setEditUrl] = useState(item.url);
  const [editPrompt, setEditPrompt] = useState(item.prompt ?? "");
  const [editFechaInicio, setEditFechaInicio] = useState(item.fecha_inicio ?? "");
  const [editFechaFin, setEditFechaFin] = useState(item.fecha_fin ?? "");
  const [saving, setSaving] = useState(false);

  const lastScraping = item.fecha_ultimo_scraping
    ? new Date(item.fecha_ultimo_scraping).toLocaleString("es-AR", {
        day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  function startEdit() {
    setEditNombre(item.nombre ?? "");
    setEditUrl(item.url);
    setEditPrompt(item.prompt ?? "");
    setEditFechaInicio(item.fecha_inicio ?? "");
    setEditFechaFin(item.fecha_fin ?? "");
    onEdit();
  }

  async function handleSave() {
    setSaving(true);
    await onUpdate(item.id, {
      nombre: editNombre.trim() || null,
      url: editUrl.trim() || item.url,
      prompt: editPrompt.trim() || null,
      fecha_inicio: editFechaInicio || null,
      fecha_fin: editFechaFin || null,
    });
    setSaving(false);
  }

  const displayPrompt = item.prompt ?? "";

  const modal = editing ? createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancelEdit(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 10, padding: 24, width: "100%", maxWidth: 480, margin: "0 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Editar URL</h3>
          <button type="button" onClick={onCancelEdit} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>
        <input className="input" type="text" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} placeholder="Nombre (ej: Nocito Constructora)" style={{ width: "100%" }} />
        <input className="input" type="text" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="URL" style={{ width: "100%" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" type="date" value={editFechaInicio} onChange={(e) => setEditFechaInicio(e.target.value)} style={{ flex: 1 }} title="Fecha inicio" />
          <input className="input" type="date" value={editFechaFin} onChange={(e) => setEditFechaFin(e.target.value)} style={{ flex: 1 }} title="Fecha fin" />
        </div>
        <textarea className="textarea" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Instrucciones para el scraping (opcional)" rows={4} style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.5 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn--ghost" onClick={onCancelEdit} disabled={saving}>Cancelar</button>
          <button type="button" className="btn" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {modal}
      <tr>
        <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.nombre && (
            <span style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#111" }}>{item.nombre}</span>
          )}
          <a href={item.url} target="_blank" rel="noreferrer" title={item.url}
            style={{ fontSize: item.nombre ? 11 : 13, color: item.nombre ? "#9ca3af" : undefined }}>
            {item.url}
          </a>
        </td>
        <td>
          <select className="input" value={item.frecuencia} onChange={(e) => onFrecuenciaChange(item.id, e.target.value as Frecuencia)} style={{ fontSize: 13, padding: "2px 6px", height: "auto" }}>
            <option value="diaria">Diaria</option>
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
          </select>
        </td>
        <td style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
          {item.fecha_inicio ? new Date(item.fecha_inicio).toLocaleDateString("es-AR") : "—"}
        </td>
        <td style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
          {item.fecha_fin ? new Date(item.fecha_fin).toLocaleDateString("es-AR") : "—"}
        </td>
        <td style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{lastScraping}</td>
        <td>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn--ghost" style={{ fontSize: 12, padding: "3px 10px" }} onClick={startEdit} disabled={scraping}>Editar</button>
            <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 10px", background: "#ef4444", borderColor: "#ef4444", color: "#fff" }} onClick={() => onDelete(item.id)} disabled={scraping}>Eliminar</button>
          </div>
        </td>
      </tr>
      {displayPrompt && (
        <tr>
          <td colSpan={6} style={{ padding: "3px 12px 10px", borderTop: "none" }}>
            <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{displayPrompt}</span>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatErr(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error desconocido.";
}

function getUserHint(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem("intel:user_id") ?? undefined;
}
