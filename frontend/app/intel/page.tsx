"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ScrapeForm } from "../../components/ScrapeForm";
import { ResultsTable } from "../../components/ResultsTable";
import { ApiError, scrapeBatch, saveBatch } from "../../lib/api";
import type { BatchScrapeResponse, BatchScrapeItemResponse } from "../../lib/types";

type Status = "idle" | "loading" | "result" | "error";

export default function IntelScrapePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [batchResult, setBatchResult] = useState<BatchScrapeResponse | null>(null);
  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<"save" | "discard" | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(urls: string[], prompt: string) {
    setStatus("loading");
    setErrorMsg(null);
    setSuccessMsg(null);
    setBatchResult(null);
    setExpandedUrls(new Set());

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await scrapeBatch(
        { urls, prompt, user_id: getUserHint() },
        controller.signal,
      );
      setBatchResult(data);
      setStatus("result");
      // La primera URL empieza expandida
      if (data.results.length > 0) {
        setExpandedUrls(new Set([data.results[0].url]));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
      setErrorMsg(formatErr(err));
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function toggleExpanded(url: string) {
    setExpandedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  }

  async function handleSaveAll() {
    if (!batchResult) return;
    const okResults = batchResult.results.filter((r) => r.status === "ok" && r.rows.length > 0);
    if (okResults.length === 0) return;

    setActionInFlight("save");
    setErrorMsg(null);
    try {
      const res = await saveBatch({
        results: okResults.map((r) => ({
          request_id: r.request_id,
          url: r.url,
          columns: r.columns,
          rows: r.rows,
        })),
        prompt: batchResult.prompt,
        user_id: getUserHint(),
      });
      setSuccessMsg(`${res.message} (${res.total_persisted_rows} registro/s en ${res.saved_ids.length} URL/s).`);
      setBatchResult(null);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleDiscardAll() {
    if (!batchResult) return;
    setActionInFlight("discard");
    setErrorMsg(null);
    try {
      // El discard del batch no tiene endpoint dedicado — simplemente descartamos en el front.
      // El audit log de cada URL ya quedó registrado al hacer scrape.
      setSuccessMsg("Información descartada. No se persistió ningún registro.");
      setBatchResult(null);
      setStatus("idle");
    } finally {
      setActionInFlight(null);
    }
  }

  const okCount = batchResult?.results.filter((r) => r.status === "ok" && r.rows.length > 0).length ?? 0;

  return (
    <main className="page">
      <header className="page__header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page__title">Extracción inteligente desde web</h1>
            <p className="page__subtitle">
              Pegá una o varias URLs (una por línea) e indicá qué información extraer.
              El sistema analiza automáticamente datos de empresas, obras y desarrolladoras.
            </p>
          </div>
          <Link href="/intel/historial" className="btn btn--ghost" style={{ whiteSpace: "nowrap", marginLeft: 16 }}>
            Ver historial →
          </Link>
        </div>
      </header>

      {successMsg && (
        <div className="banner banner--success" role="status">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="banner banner--error" role="alert">
          {errorMsg}
        </div>
      )}

      <ScrapeForm
        onSubmit={handleSubmit}
        loading={status === "loading"}
        onCancel={handleCancel}
      />

      {status === "loading" && (
        <div className="card">
          <div className="loader" role="status" aria-live="polite">
            <span className="loader__spinner" aria-hidden="true" />
            <span>
              Analizando las páginas y extrayendo información... esto puede demorar
              hasta ~75 segundos por URL.
            </span>
          </div>
        </div>
      )}

      {status === "result" && batchResult && (
        <section>
          {/* Resumen del batch */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p className="meta-line" style={{ margin: 0 }}>
                {batchResult.total_urls} URL/s procesadas ·{" "}
                <span style={{ color: "var(--color-success, #16a34a)" }}>
                  {batchResult.ok_count} exitosas
                </span>
                {batchResult.error_count > 0 && (
                  <span style={{ color: "var(--color-error, #dc2626)" }}>
                    {" "}· {batchResult.error_count} con error
                  </span>
                )}
              </p>
              <div className="button-row" style={{ margin: 0 }}>
                <button
                  className="btn"
                  onClick={handleSaveAll}
                  disabled={actionInFlight !== null || okCount === 0}
                >
                  {actionInFlight === "save" ? "Guardando..." : `Guardar todo (${okCount})`}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={handleDiscardAll}
                  disabled={actionInFlight !== null}
                >
                  {actionInFlight === "discard" ? "Descartando..." : "Descartar todo"}
                </button>
              </div>
            </div>
          </div>

          {/* Sección colapsable por URL */}
          {batchResult.results.map((item) => (
            <UrlResultSection
              key={item.url}
              item={item}
              expanded={expandedUrls.has(item.url)}
              onToggle={() => toggleExpanded(item.url)}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function UrlResultSection({
  item,
  expanded,
  onToggle,
}: {
  item: BatchScrapeItemResponse;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="card" style={{ marginTop: 8 }}>
      {/* Header colapsable */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
        }}
      >
        <StatusBadge status={item.status} />
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 13,
            fontWeight: 500,
          }}
          title={item.url}
        >
          {item.url}
        </span>
        {item.status === "ok" && (
          <span className="meta-line" style={{ whiteSpace: "nowrap", margin: 0, fontSize: 12 }}>
            {item.rows.length} fila/s · {item.elapsed_ms} ms
          </span>
        )}
        <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Contenido */}
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {item.status === "error" ? (
            <div className="banner banner--error" style={{ margin: 0 }}>
              {item.error_message ?? "Error desconocido al procesar la URL."}
            </div>
          ) : (
            <>
              {item.warnings.length > 0 && (
                <div className="banner banner--warning" style={{ marginBottom: 12 }}>
                  {item.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
              <ResultsTable columns={item.columns} rows={item.rows} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "ok" | "error" }) {
  const styles: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    flexShrink: 0,
    background: status === "ok" ? "#dcfce7" : "#fee2e2",
    color: status === "ok" ? "#15803d" : "#b91c1c",
  };
  return <span style={styles}>{status === "ok" ? "OK" : "Error"}</span>;
}

function formatErr(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.errorCode === "SCRAPE_TIMEOUT") {
      return "El análisis superó el tiempo máximo. Probá con otra URL o reintentá más tarde.";
    }
    if (err.errorCode === "SCRAPE_FAILED") {
      return "No se pudo obtener contenido de la URL. Verificá que sea pública y accesible.";
    }
    if (err.errorCode === "EXTRACTION_FAILED") {
      return "El extractor falló al procesar la página. Reintentá en unos minutos.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Error desconocido al comunicarse con el servicio.";
}

function getUserHint(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem("intel:user_id") ?? undefined;
}
