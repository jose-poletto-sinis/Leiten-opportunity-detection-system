"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { revealApolloContact, searchApolloPeople } from "../../lib/api";
import type { ApolloContacto, ApolloRevealResponse } from "../../lib/types";

const TITULOS_CONSTRUCCION = [
  "Arquitecto",
  "Ingeniero Civil",
  "Maestro Mayor de Obra",
  "Jefe de Obra",
  "Director de Obra",
  "Gerente de Obra",
  "Supervisor de Obra",
  "Capataz",
  "Jefe de Mantenimiento",
  "Contratista",
  "Proyectista",
];

const POR_PAGINA = 10;

function isLikelyDomain(s: string) {
  return s.includes(".") && !s.includes(" ");
}

function ProspectosInner() {
  const params = useSearchParams();
  const initialEmpresa = params.get("empresa") ?? "";

  const [empresa, setEmpresa] = useState(initialEmpresa);
  const [titulos, setTitulos] = useState<string[]>(TITULOS_CONSTRUCCION.slice(0, 6));
  const [pagina, setPagina] = useState(1);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [contactos, setContactos] = useState<ApolloContacto[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);

  const [revealing, setRevealing] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, ApolloRevealResponse>>({});
  const [revealConfirm, setRevealConfirm] = useState<string | null>(null);

  const didAutoSearch = useRef(false);

  async function runSearch(emp: string, tits: string[], pag: number) {
    if (!emp.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const isDomain = isLikelyDomain(emp.trim());
      const result = await searchApolloPeople({
        ...(isDomain ? { domain: emp.trim() } : { org_name: emp.trim() }),
        titulos: tits.length > 0 ? tits : undefined,
        pagina: pag,
        por_pagina: POR_PAGINA,
      });
      setContactos(result.contactos);
      setTotal(result.total);
      setSearched(true);
    } catch (err: any) {
      setErrorMsg(err.message ?? "Error al buscar contactos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialEmpresa && !didAutoSearch.current) {
      didAutoSearch.current = true;
      runSearch(initialEmpresa, titulos, 1);
    }
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPagina(1);
    runSearch(empresa, titulos, 1);
  }

  function toggleTitulo(t: string) {
    setTitulos((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  async function doReveal(apolloId: string) {
    setRevealConfirm(null);
    setRevealing(apolloId);
    try {
      const result = await revealApolloContact(apolloId);
      setRevealed((prev) => ({ ...prev, [apolloId]: result }));
    } catch (err: any) {
      setErrorMsg(err.message ?? "Error al revelar contacto.");
    } finally {
      setRevealing(null);
    }
  }

  function changePage(newPag: number) {
    setPagina(newPag);
    runSearch(empresa, titulos, newPag);
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA);

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Prospectos</h1>
        <p className="page__subtitle">
          Encontrá contactos clave en empresas del sector construcción.
        </p>
      </header>

      {errorMsg && (
        <div className="banner banner--error" role="alert">
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

      <form className="card" onSubmit={onSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label className="field__label" style={{ display: "block", marginBottom: 4 }}>
            Empresa (nombre o dominio web)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              type="text"
              placeholder="Ej: Constructora Pérez  o  constructoraperez.com.ar"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="btn"
              disabled={loading || !empresa.trim()}
            >
              {loading ? "Buscando..." : "Buscar contactos"}
            </button>
          </div>
        </div>

        <div>
          <label className="field__label" style={{ display: "block", marginBottom: 6 }}>
            Títulos / cargos
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TITULOS_CONSTRUCCION.map((t) => {
              const active = titulos.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTitulo(t)}
                  style={{
                    padding: "3px 12px",
                    borderRadius: 20,
                    fontSize: 12,
                    border: "1px solid",
                    cursor: "pointer",
                    borderColor: active ? "var(--primary, #2563eb)" : "#d1d5db",
                    background: active ? "var(--primary, #2563eb)" : "transparent",
                    color: active ? "#fff" : "#374151",
                    transition: "all 0.1s",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <p className="meta-line" style={{ marginTop: 6, marginBottom: 0 }}>
            Sin selección se busca sin filtrar por cargo.
          </p>
        </div>
      </form>

      {loading && (
        <div className="loader" style={{ padding: 16 }}>
          <span className="loader__spinner" aria-hidden="true" />
          <span>Buscando contactos...</span>
        </div>
      )}

      {!loading && searched && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid #f3f4f6",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <p className="meta-line" style={{ margin: 0 }}>
              {total > 0
                ? `${total} contacto${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}`
                : "Sin resultados para esta búsqueda"}
            </p>
            {totalPaginas > 1 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "2px 8px", fontSize: 12 }}
                  disabled={pagina <= 1}
                  onClick={() => changePage(pagina - 1)}
                >
                  ← Ant
                </button>
                <span style={{ color: "#6b7280" }}>
                  {pagina} / {totalPaginas}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "2px 8px", fontSize: 12 }}
                  disabled={pagina >= totalPaginas}
                  onClick={() => changePage(pagina + 1)}
                >
                  Sig →
                </button>
              </div>
            )}
          </div>

          {contactos.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              No se encontraron contactos. Probá con otro nombre de empresa o reducí los filtros de título.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Título</th>
                    <th scope="col">Empresa</th>
                    <th scope="col">Ubicación</th>
                    <th scope="col">Contacto</th>
                    <th scope="col" style={{ width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {contactos.map((c) => (
                    <ContactRow
                      key={c.apollo_id ?? `${c.nombre}-${c.titulo}`}
                      contacto={c}
                      revealed={c.apollo_id ? revealed[c.apollo_id] ?? null : null}
                      isRevealing={!!c.apollo_id && revealing === c.apollo_id}
                      pendingConfirm={!!c.apollo_id && revealConfirm === c.apollo_id}
                      onRevealRequest={() => c.apollo_id && setRevealConfirm(c.apollo_id)}
                      onRevealConfirm={() => c.apollo_id && doReveal(c.apollo_id)}
                      onRevealCancel={() => setRevealConfirm(null)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function ContactRow({
  contacto: c,
  revealed: rev,
  isRevealing,
  pendingConfirm,
  onRevealRequest,
  onRevealConfirm,
  onRevealCancel,
}: {
  contacto: ApolloContacto;
  revealed: ApolloRevealResponse | null;
  isRevealing: boolean;
  pendingConfirm: boolean;
  onRevealRequest: () => void;
  onRevealConfirm: () => void;
  onRevealCancel: () => void;
}) {
  const nombre = rev?.nombre ?? c.nombre ?? "—";
  const email = rev?.email ?? c.email;
  const telefono = rev?.telefono ?? c.telefono;
  const linkedin = rev?.linkedin_url ?? c.linkedin_url;

  return (
    <tr>
      <td style={{ fontWeight: 600, fontSize: 13 }}>{nombre}</td>
      <td style={{ fontSize: 12, color: "#6b7280" }}>{c.titulo ?? "—"}</td>
      <td style={{ fontSize: 12 }}>{c.empresa ?? "—"}</td>
      <td style={{ fontSize: 12, color: "#6b7280" }}>
        {[c.ciudad, c.pais].filter(Boolean).join(", ") || "—"}
      </td>
      <td style={{ fontSize: 12 }}>
        {email && (
          <div>
            <a href={`mailto:${email}`}>{email}</a>
          </div>
        )}
        {telefono && (
          <div style={{ color: "#6b7280" }}>{telefono}</div>
        )}
        {linkedin && (
          <div>
            <a href={linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </div>
        )}
        {!email && !telefono && !linkedin && (
          <span style={{ color: "#9ca3af" }}>—</span>
        )}
      </td>
      <td>
        {rev ? (
          <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>✓ Revelado</span>
        ) : pendingConfirm ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>Usa 1 crédito</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={onRevealConfirm}
              >
                Confirmar
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ fontSize: 11, padding: "2px 6px" }}
                onClick={onRevealCancel}
              >
                No
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: 12, padding: "2px 10px" }}
            disabled={isRevealing || !c.apollo_id}
            onClick={onRevealRequest}
            title={!c.apollo_id ? "Sin ID Apollo" : "Revelar datos completos (1 crédito)"}
          >
            {isRevealing ? "..." : "Revelar"}
          </button>
        )}
      </td>
    </tr>
  );
}

export default function ProspectosPage() {
  return (
    <Suspense>
      <ProspectosInner />
    </Suspense>
  );
}
