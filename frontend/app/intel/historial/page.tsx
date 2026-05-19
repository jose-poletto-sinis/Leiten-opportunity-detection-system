"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ResultsTable } from "../../../components/ResultsTable";
import { ApiError, getRecordDetail, getRecords } from "../../../lib/api";
import type { RecordDetail, RecordSummary, RecordsResponse } from "../../../lib/types";

const PAGE_SIZE = 20;

export default function HistorialPage() {
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
    <main className="page">
      <header className="page__header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="page__title">Historial de extracciones</h1>
          <Link href="/intel" className="btn btn--ghost">← Volver a extracción</Link>
        </div>
      </header>

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
    </main>
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
      {/* Header siempre visible */}
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

      {/* Prompt */}
      {expanded && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #e5e7eb", background: "#fafafa" }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>{item.prompt}</span>
        </div>
      )}

      {/* Grilla de datos */}
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

function formatErr(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error desconocido.";
}
