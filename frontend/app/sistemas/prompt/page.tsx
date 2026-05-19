"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getPrompt, updatePrompt } from "../../../lib/api";

export default function SistemasPromptPage() {
  const [prompt, setPrompt] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    getPrompt()
      .then((data) => {
        setPrompt(data.prompt);
        setUpdatedAt(data.updated_at ?? null);
      })
      .catch((err) => setErrorMsg(formatErr(err)))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) { setErrorMsg("El prompt no puede estar vacío."); return; }
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const data = await updatePrompt(prompt.trim());
      setPrompt(data.prompt);
      setUpdatedAt(data.updated_at ?? null);
      setSuccessMsg("Prompt actualizado correctamente.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 800 }}>
      <header className="page__header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page__title">Prompt del sistema</h1>
            <p className="page__subtitle">
              Esta instrucción es la que el agente de IA usa en cada análisis. Solo visible para Sistemas.
            </p>
          </div>
          <Link href="/intel" className="btn btn--ghost">← Volver</Link>
        </div>
      </header>

      {successMsg && (
        <div className="banner banner--success" role="status" style={{ marginBottom: 16 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: 16 }}>
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="loader card"><span className="loader__spinner" /><span>Cargando...</span></div>
      ) : (
        <form className="card" onSubmit={handleSave}>
          <div className="field">
            <label className="field__label" htmlFor="prompt-textarea">
              Instrucción para el agente de IA
            </label>
            <textarea
              id="prompt-textarea"
              className="textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={saving}
              rows={10}
              style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}
            />
            <span className="field__hint">
              El agente recibe el contenido de la página más esta instrucción.
              Describí qué datos extraer y en qué formato.
            </span>
          </div>

          {updatedAt && (
            <p className="meta-line" style={{ marginBottom: 14 }}>
              Última modificación: {new Date(updatedAt).toLocaleString("es-AR")}
            </p>
          )}

          <div className="button-row">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Guardando..." : "Guardar prompt"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

function formatErr(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error desconocido.";
}
