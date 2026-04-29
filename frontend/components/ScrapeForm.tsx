"use client";

import { useState } from "react";
import { validateUrls, type UrlLineError } from "../lib/validators";

interface ScrapeFormProps {
  onSubmit: (urls: string[], prompt: string) => void;
  loading: boolean;
  onCancel?: () => void;
}

export function ScrapeForm({ onSubmit, loading, onCancel }: ScrapeFormProps) {
  const [urlsRaw, setUrlsRaw] = useState("");
  const [prompt, setPrompt] = useState("");
  const [urlErrors, setUrlErrors] = useState<UrlLineError[]>([]);
  const [generalUrlError, setGeneralUrlError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Cuenta de URLs no vacías en el textarea
  const urlCount = urlsRaw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { valid, lineErrors, generalError } = validateUrls(urlsRaw);
    setUrlErrors(lineErrors);
    setGeneralUrlError(generalError ?? null);

    let promptErr: string | null = null;
    if (!prompt.trim()) {
      promptErr = "Describí qué información querés extraer.";
    } else if (prompt.trim().length < 5) {
      promptErr = "La instrucción es demasiado corta — sé más específico.";
    }
    setPromptError(promptErr);

    if ((generalError || lineErrors.length > 0) || promptErr) return;

    onSubmit(valid, prompt.trim());
  }

  const hasUrlError = generalUrlError !== null || urlErrors.length > 0;

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="intel-urls">
          URLs a analizar
        </label>
        <textarea
          id="intel-urls"
          className="textarea"
          rows={6}
          placeholder={"https://www.empresa1.com/contacto\nhttps://www.empresa2.com\nhttps://www.empresa3.com/obras"}
          value={urlsRaw}
          onChange={(e) => {
            setUrlsRaw(e.target.value);
            setUrlErrors([]);
            setGeneralUrlError(null);
          }}
          aria-invalid={hasUrlError}
          disabled={loading}
        />

        {/* Contador en vivo */}
        {urlCount > 0 && !hasUrlError && (
          <span className="field__hint">
            {urlCount} URL{urlCount !== 1 ? "s" : ""} detectada{urlCount !== 1 ? "s" : ""}
          </span>
        )}

        {/* Error general (demasiadas URLs, ninguna, etc.) */}
        {generalUrlError && (
          <span className="field__error">{generalUrlError}</span>
        )}

        {/* Errores por línea */}
        {urlErrors.length > 0 && (
          <ul className="field__error" style={{ margin: "4px 0 0", paddingLeft: 16 }}>
            {urlErrors.map((err) => (
              <li key={err.line}>{err.message}</li>
            ))}
          </ul>
        )}

        {!hasUrlError && urlCount === 0 && (
          <span className="field__hint">
            Una URL por línea. HTTP o HTTPS. Máximo 50 URLs.
          </span>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="intel-prompt">
          ¿Qué información querés extraer?
        </label>
        <textarea
          id="intel-prompt"
          className="textarea"
          placeholder="Ej: datos de contacto, CUIT, dirección y razón social de la desarrolladora; obras en curso y referentes."
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setPromptError(null);
          }}
          aria-invalid={Boolean(promptError)}
          disabled={loading}
        />
        {promptError ? (
          <span className="field__error">{promptError}</span>
        ) : (
          <span className="field__hint">
            Descripción libre. Cuanto más específico, mejor el resultado.
          </span>
        )}
      </div>

      <div className="button-row">
        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Analizando..." : "Extraer información"}
        </button>
        {loading && onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
