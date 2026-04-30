"use client";

import { useState } from "react";
import { isValidUrl } from "../lib/validators";

interface ScrapeFormProps {
  onSubmit: (urls: string[], prompt: string) => void;
  loading: boolean;
  onCancel?: () => void;
}

export function ScrapeForm({ onSubmit, loading, onCancel }: ScrapeFormProps) {
  const [urlList, setUrlList] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [urlInputError, setUrlInputError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);

  function handleAddUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlInputError("Ingresá una URL.");
      return;
    }
    if (!isValidUrl(trimmed)) {
      setUrlInputError(`URL inválida: ${trimmed}`);
      return;
    }
    if (urlList.includes(trimmed)) {
      setUrlInputError("Esa URL ya está en la lista.");
      return;
    }
    if (urlList.length >= 50) {
      setUrlInputError("Máximo 50 URLs.");
      return;
    }
    setUrlList((prev) => [...prev, trimmed]);
    setUrlInput("");
    setUrlInputError(null);
    setListError(null);
  }

  function handleRemoveUrl(url: string) {
    setUrlList((prev) => prev.filter((u) => u !== url));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let hasError = false;

    if (urlList.length === 0) {
      setListError("Agregá al menos una URL.");
      hasError = true;
    }

    let promptErr: string | null = null;
    if (!prompt.trim()) {
      promptErr = "Describí qué información querés extraer.";
    } else if (prompt.trim().length < 5) {
      promptErr = "La instrucción es demasiado corta — sé más específico.";
    }
    setPromptError(promptErr);
    if (promptErr) hasError = true;

    if (hasError) return;

    onSubmit(urlList, prompt.trim());
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="intel-url-input">
          URLs a analizar
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="intel-url-input"
            className="input"
            type="text"
            placeholder="https://www.empresa.com/contacto"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setUrlInputError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddUrl();
              }
            }}
            aria-invalid={urlInputError !== null}
            disabled={loading}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn"
            onClick={handleAddUrl}
            disabled={loading || urlList.length >= 50}
          >
            Agregar
          </button>
        </div>

        {urlInputError && (
          <span className="field__error">{urlInputError}</span>
        )}

        {urlList.length > 0 && (
          <ul
            style={{
              margin: "8px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {urlList.map((url) => (
              <li
                key={url}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#f1f5f9",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={url}
                >
                  {url}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveUrl(url)}
                  disabled={loading}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#94a3b8",
                    fontSize: 13,
                    lineHeight: 1,
                    flexShrink: 0,
                    padding: "0 2px",
                  }}
                  aria-label={`Eliminar ${url}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {listError && (
          <span className="field__error" style={{ marginTop: 4, display: "block" }}>
            {listError}
          </span>
        )}

        {!urlInputError && !listError && (
          <span className="field__hint">
            {urlList.length > 0
              ? `${urlList.length} URL${urlList.length !== 1 ? "s" : ""} en la lista · máximo 50`
              : "Ingresá una URL y presioná Agregar o Enter. Máximo 50 URLs."}
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
