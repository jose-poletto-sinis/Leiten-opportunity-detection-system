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

  const [detailRecord, setDetailRecord] = useState<RecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  async function handleOpenDetail(savedId: string) {
    setDetailLoading(true);
    try {
      const record = await getRecordDetail(savedId);
      setDetailRecord(record);
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setDetailLoading(false);
    }
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
      <div className="card" style={{ marginBottom: 8 }}>
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

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
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
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Fecha extracción</th>
                  <th scope="col">Estado</th>
                  <th scope="col">URL</th>
                  <th scope="col">Prompt</th>
                  <th scope="col" style={{ textAlign: "right" }}>Filas</th>
                  <th scope="col">Usuario</th>
                  <th scope="col" style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <HistorialRow
                    key={item.saved_id}
                    item={item}
                    onOpenDetail={handleOpenDetail}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {total > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
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

      {/* Modal de detalle */}
      {(detailRecord || detailLoading) && (
        <Modal onClose={() => setDetailRecord(null)}>
          {detailLoading ? (
            <div className="loader" role="status">
              <span className="loader__spinner" aria-hidden="true" />
              <span>Cargando detalle...</span>
            </div>
          ) : detailRecord ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <p className="meta-line" style={{ margin: 0 }}>
                  <a href={detailRecord.url} target="_blank" rel="noreferrer">
                    {detailRecord.url}
                  </a>
                </p>
                <p className="meta-line" style={{ margin: "4px 0 0" }}>
                  {detailRecord.prompt}
                </p>
              </div>
              <ResultsTable columns={detailRecord.columns} rows={detailRecord.rows} />
            </>
          ) : null}
        </Modal>
      )}
    </main>
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
      }}
    >
      {status}
    </span>
  );
}

function HistorialRow({
  item,
  onOpenDetail,
}: {
  item: RecordSummary;
  onOpenDetail: (id: string) => void;
}) {
  const date = new Date(item.created_at).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const promptShort = item.prompt.length > 60 ? item.prompt.slice(0, 60) + "…" : item.prompt;

  return (
    <tr>
      <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{date}</td>
      <td><StatusBadge status={item.status} /></td>
      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <a href={item.url} target="_blank" rel="noreferrer" title={item.url}>
          {item.url}
        </a>
      </td>
      <td style={{ maxWidth: 240 }}>
        <span title={item.prompt}>{promptShort}</span>
      </td>
      <td style={{ textAlign: "right" }}>{item.row_count}</td>
      <td style={{ fontSize: 12, color: "#888" }}>{item.user_id ?? "—"}</td>
      <td>
        <button
          type="button"
          className="btn btn--ghost"
          style={{ padding: "2px 8px", fontSize: 12 }}
          onClick={() => onOpenDetail(item.saved_id)}
        >
          Ver
        </button>
      </td>
    </tr>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 900,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            color: "#888",
          }}
          aria-label="Cerrar"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

function formatErr(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error desconocido.";
}
