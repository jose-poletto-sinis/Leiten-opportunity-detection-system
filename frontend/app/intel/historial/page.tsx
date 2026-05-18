"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ResultsTable } from "../../../components/ResultsTable";
import { ApiError, getRecordDetail, getRecords } from "../../../lib/api";
import type { RecordDetail, RecordSummary, RecordsResponse } from "../../../lib/types";

const PAGE_SIZE = 50;

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
      const result = await getRecords({
        limit: PAGE_SIZE,
        offset,
        q: search || undefined,
      });
      setData(result);
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setLoading(false);
    }
  }, [offset, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
  }

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <main className="page">
      <header className="page__header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="page__title">Historial de extracciones</h1>
          <Link href="/intel" className="btn btn--ghost">
            ← Volver a extracción
          </Link>
        </div>
      </header>

      {errorMsg && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: 12 }}>
          {errorMsg}
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 12 }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            type="text"
            placeholder="Buscar por URL o prompt..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn">
            Buscar
          </button>
          {search && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setOffset(0);
              }}
            >
              Limpiar
            </button>
          )}
        </form>
      </div>

      {/* Lista de extracciones */}
      {loading ? (
        <div className="loader" style={{ padding: 24 }} role="status">
          <span className="loader__spinner" aria-hidden="true" />
          <span>Cargando historial...</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="empty-state" style={{ padding: 32 }}>
          {search ? `Sin resultados para "${search}".` : "No hay registros guardados todavía."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.items.map((item) => (
            <HistorialCard key={item.saved_id} item={item} />
          ))}
        </div>
      )}

      {/* Paginación */}
      {total > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
          }}
        >
          <span className="meta-line">
            {from}–{to} de {total}
          </span>
          <div className="button-row" style={{ margin: 0 }}>
            <button
              className="btn btn--ghost"
              disabled={!canPrev}
              onClick={() => setOffset(offset - PAGE_SIZE)}
            >
              ← Anterior
            </button>
            <button
              className="btn btn--ghost"
              disabled={!canNext}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function HistorialCard({ item }: { item: RecordSummary }) {
  const [collapsed, setCollapsed] = useState(false);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await getRecordDetail(item.saved_id);
        if (!cancelled) setDetail(d);
      } catch (err) {
        if (!cancelled) setDetailError(formatErr(err));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [item.saved_id]);

  const date = new Date(item.created_at).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const promptShort =
    item.prompt.length > 80 ? item.prompt.slice(0, 80) + "…" : item.prompt;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Cabecera */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: collapsed ? "none" : "1px solid #e5e7eb",
          flexWrap: "wrap",
          background: "#fafafa",
        }}
      >
        <StatusBadge status={item.status} />

        <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
          {date}
        </span>

        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          title={item.url}
          style={{
            fontSize: 13,
            flex: 1,
            minWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.url}
        </a>

        <span
          title={item.prompt}
          style={{
            fontSize: 12,
            color: "#555",
            maxWidth: 320,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {promptShort}
        </span>

        <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
          {item.row_count} {item.row_count === 1 ? "fila" : "filas"}
        </span>

        <button
          type="button"
          className="btn btn--ghost"
          style={{ padding: "2px 10px", fontSize: 12, whiteSpace: "nowrap" }}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "Expandir ▼" : "Colapsar ▲"}
        </button>
      </div>

      {/* Grilla de resultados */}
      {!collapsed && (
        <div>
          {detailLoading ? (
            <div className="loader" style={{ padding: 16 }} role="status">
              <span className="loader__spinner" aria-hidden="true" />
              <span>Cargando datos...</span>
            </div>
          ) : detailError ? (
            <div className="banner banner--error" style={{ margin: 12 }}>
              {detailError}
            </div>
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
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        background: isPendiente ? "#fef3c7" : "#dcfce7",
        color: isPendiente ? "#92400e" : "#15803d",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

function formatErr(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error desconocido.";
}
