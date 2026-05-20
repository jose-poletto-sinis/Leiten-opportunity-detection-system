"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  deleteRegisteredUrl,
  getPrompt,
  getRecords,
  getRegisteredUrls,
  registerUrl,
  scrapeRegisteredUrl,
  updatePrompt,
  updateRegisteredUrl,
} from "../../lib/api";
import type { Frecuencia, RecordSummary, RegisteredUrl } from "../../lib/types";
import { isValidUrl } from "../../lib/validators";

function formatErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Error desconocido.";
}

// ─── Estilos inline globales ──────────────────────────────────────────────────

const S = {
  page: {
    minHeight: "100vh",
    background: "#0f172a",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#f1f5f9",
  } as React.CSSProperties,
  header: {
    background: "#0f172a",
    borderBottom: "1px solid #1e293b",
    padding: "0 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 64,
  } as React.CSSProperties,
  logo: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    fontSize: 18,
    fontWeight: 700,
    color: "#f1f5f9",
    textDecoration: "none",
  } as React.CSSProperties,
  logoAccent: { color: "#60a5fa" } as React.CSSProperties,
  headerActions: { display: "flex", gap: 10 } as React.CSSProperties,
  body: { padding: "32px" } as React.CSSProperties,
  heroTitle: { margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#f1f5f9" } as React.CSSProperties,
  heroSub: { margin: "0 0 28px", fontSize: 14, color: "#94a3b8" } as React.CSSProperties,
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 14,
    marginBottom: 28,
  } as React.CSSProperties,
  statCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "18px 22px",
    color: "#fff",
  } as React.CSSProperties,
  statLabel: { margin: "0 0 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" as const },
  statValue: { margin: 0, fontSize: 32, fontWeight: 700, lineHeight: 1 },
  card: {
    background: "#1e293b",
    borderRadius: 12,
    border: "1px solid #334155",
    overflow: "hidden",
  } as React.CSSProperties,
  tableWrap: { overflowX: "auto" as const },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: {
    padding: "12px 16px",
    textAlign: "left" as const,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "#94a3b8",
    background: "#0f172a",
    borderBottom: "1px solid #334155",
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "13px 16px",
    borderBottom: "1px solid #334155",
    verticalAlign: "middle" as const,
    color: "#e2e8f0",
  },
  badge: (f: Frecuencia) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: f === "diaria" ? "#dcfce7" : f === "semanal" ? "#dbeafe" : "#fef9c3",
    color: f === "diaria" ? "#15803d" : f === "semanal" ? "#1d4ed8" : "#854d0e",
  }) as React.CSSProperties,
  btnPrimary: {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "#3b82f6", color: "#fff", border: "none",
    borderRadius: 8, padding: "9px 18px", fontSize: 14,
    fontWeight: 600, cursor: "pointer",
  } as React.CSSProperties,
  btnSecondary: {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "transparent", color: "#cbd5e1",
    border: "1px solid #334155",
    borderRadius: 8, padding: "9px 14px", fontSize: 14,
    fontWeight: 500, cursor: "pointer",
  } as React.CSSProperties,
  btnEdit: {
    background: "#334155", color: "#e2e8f0", border: "1px solid #475569",
    borderRadius: 6, padding: "5px 12px", fontSize: 12,
    fontWeight: 500, cursor: "pointer",
  } as React.CSSProperties,
  btnDelete: {
    background: "#ef4444", color: "#fff", border: "none",
    borderRadius: 6, padding: "5px 12px", fontSize: 12,
    fontWeight: 600, cursor: "pointer",
  } as React.CSSProperties,
  overlay: {
    position: "fixed", inset: 0, zIndex: 50,
    background: "rgba(15,23,42,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
  } as React.CSSProperties,
  modal: {
    background: "#1e293b", borderRadius: 14, padding: 28,
    width: "100%", maxWidth: 520, margin: "0 16px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
    display: "flex", flexDirection: "column" as const, gap: 16,
    border: "1px solid #334155",
  },
  modalTitle: { margin: 0, fontSize: 17, fontWeight: 700, color: "#f1f5f9" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 5 },
  input: {
    width: "100%", padding: "9px 12px", fontSize: 13,
    border: "1px solid #334155", borderRadius: 8,
    outline: "none", boxSizing: "border-box" as const,
    color: "#f1f5f9", background: "#0f172a",
  } as React.CSSProperties,
  textarea: {
    width: "100%", padding: "9px 12px", fontSize: 13,
    border: "1px solid #334155", borderRadius: 8,
    outline: "none", boxSizing: "border-box" as const,
    fontFamily: "inherit", lineHeight: 1.6, resize: "vertical" as const,
    color: "#f1f5f9", background: "#0f172a",
  } as React.CSSProperties,
  select: {
    width: "100%", padding: "9px 12px", fontSize: 13,
    border: "1px solid #334155", borderRadius: 8,
    outline: "none", background: "#0f172a", color: "#f1f5f9",
    cursor: "pointer",
  } as React.CSSProperties,
  error: {
    background: "#450a0a", border: "1px solid #7f1d1d",
    color: "#fca5a5", borderRadius: 8, padding: "10px 14px",
    fontSize: 13,
  } as React.CSSProperties,
  empty: {
    padding: "60px 32px", textAlign: "center" as const,
    color: "#94a3b8", fontSize: 14,
  },
};

// ─── Modal ejecutar ──────────────────────────────────────────────────────────

function EjecutarModal({ tarea, systemPrompt, onClose }: { tarea: RegisteredUrl; systemPrompt: string; onClose: () => void }) {
  const [historial, setHistorial] = useState<RecordSummary[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    getRecords({ registered_id: tarea.id, limit: 10 })
      .then((r) => setHistorial(r.items))
      .catch(() => {})
      .finally(() => setLoadingHist(false));
  }, [tarea.id]);

  async function handleEjecutar() {
    setRunning(true);
    setRunError(null);
    try {
      await scrapeRegisteredUrl(tarea.id);
      const r = await getRecords({ registered_id: tarea.id, limit: 10 });
      setHistorial(r.items);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Error al ejecutar");
    } finally {
      setRunning(false);
    }
  }

  const promptLabel = tarea.prompt ?? systemPrompt ?? "por defecto";

  const modal = (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, width: "100%", maxWidth: 680, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#a78bfa", fontSize: 18 }}>▶</span>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>Ejecutar</span>
            <span style={{ color: "#64748b" }}>·</span>
            <span style={{ color: "#94a3b8", fontSize: 15 }}>{tarea.nombre ?? tarea.url}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Cuerpo scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Info */}
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8" }}>
            Se va a <strong style={{ color: "#f1f5f9" }}>scrapear la URL</strong> de la tarea, pasar el contenido + el prompt a la <strong style={{ color: "#f1f5f9" }}>IA</strong>, y guardar el resultado en la base de datos.
          </p>
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
            <div><span style={{ color: "#64748b" }}>URL: </span><a href={tarea.url} target="_blank" rel="noreferrer" style={{ color: "#3b82f6" }}>{tarea.url}</a></div>
            <div style={{ marginTop: 6 }}><span style={{ color: "#64748b" }}>Prompt: </span><span style={{ color: "#94a3b8" }}>{promptLabel.slice(0, 80)}{promptLabel.length > 80 ? "…" : ""}</span></div>
          </div>

          {runError && (
            <div style={{ background: "#450a0a", border: "1px solid #dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#fca5a5" }}>{runError}</div>
          )}

          {/* Historial */}
          <div style={{ borderTop: "1px solid #334155", paddingTop: 16 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Historial</p>
            {loadingHist ? (
              <p style={{ color: "#64748b", fontSize: 13 }}>Cargando...</p>
            ) : historial.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: 13 }}>Sin ejecuciones anteriores.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {historial.map((rec) => (
                  <div key={rec.saved_id} style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderLeft: "3px solid #22c55e", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
                      <span style={{ background: "#14532d", color: "#86efac", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>OK</span>
                      <span style={{ color: "#64748b" }}>
                        {new Date(rec.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{rec.row_count} fila{rec.row_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {rec.rows_preview && (
                      <pre style={{ margin: 0, fontSize: 11, color: "#94a3b8", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflowY: "auto" }}>
                        {rec.rows_preview}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #334155", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #334155", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>Cerrar</button>
          <button onClick={handleEjecutar} disabled={running} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: running ? "#4c1d95" : "#7c3aed", color: "#fff", cursor: running ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {running ? "Ejecutando..." : "▶ Ejecutar ahora"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Modal de configuración ───────────────────────────────────────────────────

function ConfigModal({ current, onClose, onSaved }: { current: string; onClose: () => void; onSaved: (p: string) => void }) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setSaving(true);
    try {
      await updatePrompt(value.trim());
      onSaved(value.trim());
      onClose();
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSave} style={S.modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={S.modalTitle}>Configuración</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8" }}>✕</button>
        </div>
        {error && <div style={S.error}>{error}</div>}
        <div>
          <label style={S.label}>Prompt por defecto</label>
          <textarea style={{ ...S.textarea, minHeight: 150 }} value={value} onChange={(e) => setValue(e.target.value)} rows={6} disabled={saving} />
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
            Se aplica automáticamente a las tareas que no tienen un prompt propio definido.
          </p>
        </div>
        <div style={{ borderTop: "1px solid #334155", paddingTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={S.btnSecondary} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" style={S.btnPrimary} disabled={saving || !value.trim()}>{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// ─── Modal de alta / edición ──────────────────────────────────────────────────

function TareaModal({ initial, systemPrompt, onClose, onSave }: {
  initial?: RegisteredUrl;
  systemPrompt: string;
  onClose: () => void;
  onSave: (item: RegisteredUrl) => void;
}) {
  const editing = !!initial;
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [frecuencia, setFrecuencia] = useState<Frecuencia | "">(initial?.frecuencia ?? "");
  const [fechaInicio, setFechaInicio] = useState(initial?.fecha_inicio ?? "");
  const [fechaFin, setFechaFin] = useState(initial?.fecha_fin ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) { setUrlError("Ingresá una URL."); return; }
    if (!isValidUrl(trimmedUrl)) { setUrlError("URL inválida."); return; }
    setUrlError(null);
    setSaving(true);
    setError(null);
    try {
      if (editing && initial) {
        const updated = await updateRegisteredUrl(initial.id, {
          nombre: nombre.trim() || null,
          url: trimmedUrl,
          frecuencia: (frecuencia || "diaria") as Frecuencia,
          prompt: prompt.trim() || null,
          fecha_inicio: fechaInicio || null,
          fecha_fin: fechaFin || null,
        });
        onSave(updated);
      } else {
        const created = await registerUrl({
          nombre: nombre.trim() || undefined,
          url: trimmedUrl,
          frecuencia: (frecuencia || "diaria") as Frecuencia,
          prompt: prompt.trim() || undefined,
          fecha_inicio: fechaInicio || undefined,
          fecha_fin: fechaFin || undefined,
        });
        onSave({ ...created, prompt: (created.prompt ?? prompt.trim()) || null });
      }
      onClose();
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} noValidate style={S.modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={S.modalTitle}>{editing ? "Editar tarea" : "Nueva tarea de scraping"}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8" }}>✕</button>
        </div>
        {error && <div style={S.error}>{error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Nombre</label>
            <input style={S.input} type="text" placeholder="Ej: Scraping LinkedIn IT" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={saving} />
          </div>
          <div>
            <label style={S.label}>URL</label>
            <input style={{ ...S.input, borderColor: urlError ? "#f87171" : "#334155" }} type="text" placeholder="https://ejemplo.com" value={url} onChange={(e) => { setUrl(e.target.value); setUrlError(null); }} disabled={saving} />
            {urlError && <span style={{ fontSize: 12, color: "#f87171", marginTop: 4, display: "block" }}>{urlError}</span>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Fecha de inicio (opcional)</label>
              <input style={S.input} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} disabled={saving} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Fecha de finalización (opcional)</label>
              <input style={S.input} type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div>
            <label style={S.label}>Frecuencia</label>
            <select style={S.select} value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)} disabled={saving}>
              <option value="" disabled>Seleccionar...</option>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Prompt para la IA <span style={{ fontWeight: 400, color: "#64748b" }}>(opcional)</span></label>
            <textarea style={{ ...S.textarea, minHeight: 90 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describí qué información debe extraer la IA de la página..." rows={3} disabled={saving} />
            {systemPrompt && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#94a3b8" }}>
                  Si lo dejás vacío, se usa el <strong style={{ color: "#cbd5e1" }}>prompt por defecto:</strong>
                </p>
                <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                  {systemPrompt}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ borderTop: "1px solid #334155", paddingTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={S.btnSecondary} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" style={S.btnPrimary} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TareasPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tareas, setTareas] = useState<RegisteredUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RegisteredUrl | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [ejecutando, setEjecutando] = useState<RegisteredUrl | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("leiten_intel_token") : null;
    if (!token) { router.replace("/login"); return; }
    setReady(true);
    Promise.all([getRegisteredUrls(), getPrompt()])
      .then(([urls, cfg]) => { setTareas(urls); setSystemPrompt(cfg.prompt); })
      .catch((err) => setErrorMsg(formatErr(err)))
      .finally(() => setLoading(false));
  }, [router]);

  function handleSave(item: RegisteredUrl) {
    setTareas((prev) => {
      const idx = prev.findIndex((t) => t.id === item.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = item; return next; }
      return [item, ...prev];
    });
  }

  async function handleDelete(id: string) {
    try {
      await deleteRegisteredUrl(id);
      setTareas((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setErrorMsg(formatErr(err));
    }
  }

  if (!ready) return null;

  const total = tareas.length;
  const diarias = tareas.filter((t) => t.frecuencia === "diaria").length;
  const semanales = tareas.filter((t) => t.frecuencia === "semanal").length;
  const mensuales = tareas.filter((t) => t.frecuencia === "mensual").length;

  return (
    <div style={S.page}>
      {/* Cuerpo */}
      <div style={S.body}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ ...S.heroTitle, marginBottom: 0 }}>Scraping de Clientes Potenciales</h1>
          <div style={S.headerActions}>
            <button style={S.btnSecondary} onClick={() => setConfigOpen(true)}>
              ⚙ Configuración
            </button>
            <button style={S.btnPrimary} onClick={() => { setEditing(null); setModalOpen(true); }}>
              + Nueva tarea
            </button>
          </div>
        </div>
        <p style={S.heroSub}>Gestión de tareas de scraping automatizado con IA</p>

        {errorMsg && (
          <div style={{ ...S.error, marginBottom: 20 }}>
            {errorMsg}
            <button type="button" onClick={() => setErrorMsg(null)} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontWeight: 700 }}>✕</button>
          </div>
        )}

        {/* Stats */}
        <div style={S.statsGrid}>
          {[
            { label: "Total tareas", value: total },
            { label: "Diarias", value: diarias },
            { label: "Semanales", value: semanales },
            { label: "Mensuales", value: mensuales },
          ].map(({ label, value }) => (
            <div key={label} style={S.statCard}>
              <p style={S.statLabel}>{label}</p>
              <p style={S.statValue}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div style={S.card}>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>Cargando...</div>
          ) : tareas.length === 0 ? (
            <div style={S.empty}>No hay tareas todavía. Creá la primera con "+ Nueva tarea".</div>
          ) : (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["Nombre", "URL", "Inicio", "Fin", "Frecuencia", "Prompt", "Último scraping", "Acciones"].map((h) => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tareas.map((t) => (
                    <tr key={t.id} style={{ transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#263548")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ ...S.td, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {t.nombre ?? <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...S.td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={t.url} target="_blank" rel="noreferrer" title={t.url}
                          style={{ color: "#3b82f6", textDecoration: "none", fontSize: 12 }}>
                          {t.url}
                        </a>
                      </td>
                      <td style={{ ...S.td, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                        {t.fecha_inicio ? new Date(t.fecha_inicio).toLocaleDateString("es-AR") : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...S.td, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                        {t.fecha_fin ? new Date(t.fecha_fin).toLocaleDateString("es-AR") : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={S.td}>
                        <span style={S.badge(t.frecuencia)}>{t.frecuencia}</span>
                      </td>
                      <td style={{ ...S.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>
                        {t.prompt
                          ? t.prompt.slice(0, 45) + (t.prompt.length > 45 ? "…" : "")
                          : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...S.td, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                        {t.fecha_ultimo_scraping
                          ? new Date(t.fecha_ultimo_scraping).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                          : <span style={{ color: "#475569" }}>Nunca</span>}
                      </td>
                      <td style={S.td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={{ ...S.btnEdit, background: "#5b21b6", borderColor: "#5b21b6", color: "#fff" }} onClick={() => setEjecutando(t)}>▶ Ejecutar</button>
                          <button style={S.btnEdit} onClick={() => { setEditing(t); setModalOpen(true); }}>Editar</button>
                          <button style={S.btnDelete} onClick={() => handleDelete(t.id)}>Borrar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <TareaModal
          initial={editing ?? undefined}
          systemPrompt={systemPrompt}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
      {configOpen && (
        <ConfigModal
          current={systemPrompt}
          onClose={() => setConfigOpen(false)}
          onSaved={(p) => setSystemPrompt(p)}
        />
      )}
      {ejecutando && (
        <EjecutarModal
          tarea={ejecutando}
          systemPrompt={systemPrompt}
          onClose={() => setEjecutando(null)}
        />
      )}
    </div>
  );
}
