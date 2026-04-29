"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ResultsTable } from "../../../components/ResultsTable";
import { ApiError, deleteRecordById, getRecordDetail, getRecords } from "../../../lib/api";
import type { RecordDetail, RecordSummary, RecordsResponse } from "../../../lib/types";

const PAGE_SIZE = 50;

export default function HistorialPage() {
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterMine, setFilterMine] = useState(false);

  // Modal de detalle
  const [detailRecord, setDetailRecord] = useState<RecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Confirmación de eliminación
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const userId = getUserHint();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await getRecords({
        limit: PAGE_SIZE,
        offset,
        user_id: filterMine && userId ? userId : undefined,
        q: search || undefined,
      });
      setData(result);
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setLoading(false);
    }
  }, [offset, search, filterMine, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
  }

  function handleFilterToggle(mine: boolean) {
    setFilterMine(mine);
    setOffset(0);
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

  async function handleDelete(savedId: string) {
    setDeletingId(savedId);
    try {
      await deleteRecordById(savedId, userId);
      setDeleteConfirm(null);
      await fetchData();
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setDeletingId(null);
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
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
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

          <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #e5e7eb" }}>
            <button
              type="button"
              className={`btn${!filterMine ? "" : " btn--ghost"}`}
              style={{ borderRadius: 0, border: "none" }}
              onClick={() => handleFilterToggle(false)}
            >
              Todos
            </button>
            <button
              type="button"
              className={`btn${filterMine ? "" : " btn--ghost"}`}
              style={{ borderRadius: 0, border: "none" }}
              onClick={() => handleFilterToggle(true)}
            >
              Mis guardados
            </button>
          </div>
        </div>
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
                  <th scope="col">Fecha</th>
                  <th scope="col">URL</th>
                  <th scope="col">Prompt</th>
                  <th scope="col" style={{ textAlign: "right" }}>Filas</th>
                  <th scope="col">Usuario</th>
                  <th scope="col" style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <HistorialRow
                    key={item.saved_id}
                    item={item}
                    onOpenDetail={handleOpenDetail}
                    onDelete={(id) => setDeleteConfirm(id)}
                    deletingId={deletingId}
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

      {/* Confirmación de eliminación */}
      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)}>
          <p style={{ marginBottom: 16 }}>
            ¿Eliminar este registro? Esta acción no se puede deshacer.
          </p>
          <div className="button-row">
            <button
              className="btn"
              style={{ background: "#dc2626" }}
              onClick={() => handleDelete(deleteConfirm)}
              disabled={deletingId !== null}
            >
              {deletingId ? "Eliminando..." : "Eliminar"}
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => setDeleteConfirm(null)}
              disabled={deletingId !== null}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function HistorialRow({
  item,
  onOpenDetail,
  onDelete,
  deletingId,
}: {
  item: RecordSummary;
  onOpenDetail: (id: string) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
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
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: "2px 8px", fontSize: 12 }}
            onClick={() => onOpenDetail(item.saved_id)}
          >
            Ver
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: "2px 8px", fontSize: 12, color: "#dc2626" }}
            onClick={() => onDelete(item.saved_id)}
            disabled={deletingId === item.saved_id}
          >
            {deletingId === item.saved_id ? "…" : "Eliminar"}
          </button>
        </div>
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

function getUserHint(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem("intel:user_id") ?? undefined;
}
