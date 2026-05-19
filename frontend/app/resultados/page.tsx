"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ResultsTable } from "../../components/ResultsTable";
import {
  ApiError,
  enrichApolloOrg,
  enrichWithAfip,
  enrichWithMaps,
  exportRecordsCsv,
  getRecordDetail,
  getRecords,
  revealApolloContact,
  searchApolloPeople,
} from "../../lib/api";

import type {
  AfipResponse,
  ApolloContacto,
  ApolloOrgResponse,
  ApolloPeopleResponse,
  ApolloRevealResponse,
  MapsEnrichResponse,
  RecordDetail,
  RecordSummary,
  RecordsResponse,
} from "../../lib/types";

const PAGE_SIZE = 50;
type ToolTab = "detail" | "maps" | "apollo" | "afip";

export default function ResultadosPage() {
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Expanded row state
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [expandedTool, setExpandedTool] = useState<ToolTab>("maps");
  const [toolLoading, setToolLoading] = useState(false);

  // Caches keyed by domain / cuit / saved_id
  const [detailCache, setDetailCache] = useState<Record<string, RecordDetail>>({});
  const [mapsCache, setMapsCache] = useState<Record<string, MapsEnrichResponse>>({});
  const [apolloOrgCache, setApolloOrgCache] = useState<Record<string, ApolloOrgResponse>>({});
  const [apolloPeopleCache, setApolloPeopleCache] = useState<Record<string, ApolloPeopleResponse>>({});
  const [afipCache, setAfipCache] = useState<Record<string, AfipResponse>>({});
  const [revealedContacts, setRevealedContacts] = useState<Record<string, ApolloRevealResponse>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);


  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await getRecords({ limit: PAGE_SIZE, offset, q: search || undefined });
      if (fechaDesde || fechaHasta) {
        const desde = fechaDesde ? new Date(fechaDesde).getTime() : 0;
        const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59").getTime() : Infinity;
        const filtered = result.items.filter((item) => {
          const t = new Date(item.created_at).getTime();
          return t >= desde && t <= hasta;
        });
        setData({ ...result, items: filtered, total: filtered.length });
      } else {
        setData(result);
      }
    } catch (err) {
      setErrorMsg(formatErr(err));
    } finally {
      setLoading(false);
    }
  }, [offset, search, fechaDesde, fechaHasta]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
  }

  function handleClear() {
    setSearchInput("");
    setSearch("");
    setFechaDesde("");
    setFechaHasta("");
    setOffset(0);
  }

  async function handleSelectTool(savedId: string, tool: ToolTab, domain: string, cuit: string | null) {
    if (expandedRowId === savedId && expandedTool === tool) {
      setExpandedRowId(null);
      return;
    }
    setExpandedRowId(savedId);
    setExpandedTool(tool);

    if (tool === "detail" && !detailCache[savedId]) {
      setToolLoading(true);
      try {
        const result = await getRecordDetail(savedId);
        setDetailCache(prev => ({ ...prev, [savedId]: result }));
      } catch (err) { setErrorMsg(formatErr(err)); }
      finally { setToolLoading(false); }
    }
    if (tool === "maps" && !mapsCache[domain]) {
      setToolLoading(true);
      try {
        const result = await enrichWithMaps(domain);
        setMapsCache(prev => ({ ...prev, [domain]: result }));
      } catch (err) { setErrorMsg(formatErr(err)); }
      finally { setToolLoading(false); }
    }
    if (tool === "apollo" && !apolloOrgCache[domain]) {
      setToolLoading(true);
      try {
        const result = await enrichApolloOrg(domain);
        setApolloOrgCache(prev => ({ ...prev, [domain]: result }));
      } catch (err) { setErrorMsg(formatErr(err)); }
      finally { setToolLoading(false); }
    }
    if (tool === "afip" && cuit && !afipCache[cuit]) {
      setToolLoading(true);
      try {
        const result = await enrichWithAfip(cuit);
        setAfipCache(prev => ({ ...prev, [cuit]: result }));
      } catch (err) { setErrorMsg(formatErr(err)); }
      finally { setToolLoading(false); }
    }
  }

  async function handleLoadApolloPeople(domain: string) {
    setToolLoading(true);
    try {
      const result = await searchApolloPeople({ domain, por_pagina: 10 });
      setApolloPeopleCache(prev => ({ ...prev, [domain]: result }));
    } catch (err) { setErrorMsg(formatErr(err)); }
    finally { setToolLoading(false); }
  }

  async function handleRevealContact(apollo_id: string) {
    setRevealingId(apollo_id);
    try {
      const result = await revealApolloContact(apollo_id);
      setRevealedContacts(prev => ({ ...prev, [apollo_id]: result }));
    } catch (err) { setErrorMsg(formatErr(err)); }
    finally { setRevealingId(null); }
  }


  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  const hasFilters = search || fechaDesde || fechaHasta;

  return (
    <main className="page">
      <header className="page__header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page__title">URLs</h1>
            <p className="page__subtitle">Datos extraídos de las fuentes monitoreadas</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn--ghost" onClick={() => exportRecordsCsv({ q: search || undefined })}>
              Exportar CSV
            </button>
            <Link href="/intel" className="btn btn--ghost">Historial</Link>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: 12 }}>
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      <form className="card" onSubmit={handleSearch} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="field__label" style={{ marginBottom: 5, display: "block" }}>Buscar por URL</label>
            <input className="input" type="text" placeholder="https://..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <div>
            <label className="field__label" style={{ marginBottom: 5, display: "block" }}>Desde</label>
            <input className="input" type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setOffset(0); }} />
          </div>
          <div>
            <label className="field__label" style={{ marginBottom: 5, display: "block" }}>Hasta</label>
            <input className="input" type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setOffset(0); }} />
          </div>
          <button type="submit" className="btn">Buscar</button>
          {hasFilters && <button type="button" className="btn btn--ghost" onClick={handleClear}>Limpiar</button>}
        </div>
      </form>

      {!loading && data && (
        <p className="meta-line" style={{ marginBottom: 10 }}>
          {total === 0 ? "Sin resultados" : `${from}–${to} de ${total} registro${total !== 1 ? "s" : ""}`}
          {hasFilters && " · filtrado"}
        </p>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loader" style={{ padding: 28 }}>
            <span className="loader__spinner" aria-hidden="true" />
            <span>Cargando resultados...</span>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="empty-state">
            {hasFilters ? "Sin resultados para los filtros aplicados." : "Todavía no hay resultados. Registrá URLs y ejecutá el primer análisis."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Sitio</th>
                  <th style={{ textAlign: "right" }}>Registros</th>
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.items.flatMap((item) => {
                  const domain = (() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return item.url; } })();
                  const cuitMatch = item.url.match(/\b(\d{2}-?\d{8}-?\d{1}|\d{11})\b/);
                  const cuit = cuitMatch?.[1] ?? null;
                  const isExpanded = expandedRowId === item.saved_id;

                  const rows = [
                    <ResultadoRow
                      key={item.saved_id}
                      item={item}
                      domain={domain}
                      cuit={cuit}
                      isExpanded={isExpanded}
                      onSelectTool={handleSelectTool}
                    />,
                  ];

                  if (isExpanded) {
                    rows.push(
                      <tr key={`${item.saved_id}-panel`}>
                        <td colSpan={4} style={{ padding: 0, borderBottom: "2px solid var(--yellow)" }}>
                          <ExpandedPanel
                            savedId={item.saved_id}
                            domain={domain}
                            cuit={cuit}
                            activeTool={expandedTool}
                            onChangeTool={(tool) => handleSelectTool(item.saved_id, tool, domain, cuit)}
                            loading={toolLoading}
                            detailData={detailCache[item.saved_id]}
                            mapsData={mapsCache[domain]}
                            apolloOrgData={apolloOrgCache[domain]}
                            apolloPeopleData={apolloPeopleCache[domain]}
                            afipData={cuit ? afipCache[cuit] : undefined}
                            revealedContacts={revealedContacts}
                            revealingId={revealingId}
                            onLoadPeople={() => handleLoadApolloPeople(domain)}
                            onRevealContact={handleRevealContact}
                          />
                        </td>
                      </tr>
                    );
                  }

                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <span className="meta-line">{from}–{to} de {total}</span>
          <div className="button-row" style={{ margin: 0 }}>
            <button className="btn btn--ghost" disabled={offset === 0} onClick={() => setOffset(offset - PAGE_SIZE)}>← Anterior</button>
            <button className="btn btn--ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Siguiente →</button>
          </div>
        </div>
      )}

    </main>
  );
}

/* ── ExpandedPanel ───────────────────────────────────────────────── */

function ExpandedPanel({
  savedId, domain, cuit, activeTool, onChangeTool, loading,
  detailData, mapsData, apolloOrgData, apolloPeopleData, afipData,
  revealedContacts, revealingId, onLoadPeople, onRevealContact,
}: {
  savedId: string;
  domain: string;
  cuit: string | null;
  activeTool: ToolTab;
  onChangeTool: (t: ToolTab) => void;
  loading: boolean;
  detailData?: RecordDetail;
  mapsData?: MapsEnrichResponse;
  apolloOrgData?: ApolloOrgResponse;
  apolloPeopleData?: ApolloPeopleResponse;
  afipData?: AfipResponse;
  revealedContacts: Record<string, ApolloRevealResponse>;
  revealingId: string | null;
  onLoadPeople: () => void;
  onRevealContact: (id: string) => void;
}) {
  const TABS: { id: ToolTab; label: string; available: boolean }[] = [
    { id: "detail", label: "Datos extraídos", available: true },
    { id: "maps", label: "Google Maps", available: true },
    { id: "apollo", label: "Perfil comercial", available: true },
    { id: "afip", label: "AFIP", available: !!cuit },
  ];

  const isLoading = loading && (
    (activeTool === "detail" && !detailData) ||
    (activeTool === "maps" && !mapsData) ||
    (activeTool === "apollo" && !apolloOrgData) ||
    (activeTool === "afip" && !afipData)
  );

  return (
    <div style={{ background: "#fefef9", borderTop: "1px solid #eee" }}>
      {/* Tab strip */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 20px" }}>
        {TABS.filter(t => t.available).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeTool(tab.id)}
            style={{
              padding: "10px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTool === tab.id ? "2px solid var(--yellow)" : "2px solid transparent",
              fontWeight: activeTool === tab.id ? 700 : 500,
              fontSize: 12,
              color: activeTool === tab.id ? "var(--black)" : "var(--text-muted)",
              cursor: "pointer",
              marginBottom: -1,
              transition: "color 0.12s",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px" }}>
        {isLoading ? (
          <Spinner text="Cargando..." />
        ) : activeTool === "detail" ? (
          detailData ? (
            detailData.rows.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No se extrajeron datos en este scraping.</div>
            ) : (
              <ResultsTable columns={detailData.columns} rows={detailData.rows} />
            )
          ) : null
        ) : activeTool === "maps" ? (
          <MapsContent data={mapsData} domain={domain} />
        ) : activeTool === "apollo" ? (
          <ApolloContent
            domain={domain}
            orgData={apolloOrgData}
            peopleData={apolloPeopleData}
            revealedContacts={revealedContacts}
            revealingId={revealingId}
            onLoadPeople={onLoadPeople}
            onRevealContact={onRevealContact}
          />
        ) : activeTool === "afip" ? (
          <AfipContent data={afipData} cuit={cuit!} />
        ) : null}
      </div>
    </div>
  );
}

/* ── Tool content panels ─────────────────────────────────────────── */

function MapsContent({ data, domain }: { data?: MapsEnrichResponse; domain: string }) {
  if (!data) return <div className="empty-state" style={{ padding: "12px 0" }}>—</div>;
  if (!data.found) return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No se encontró "{domain}" en Google Maps.</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
      {data.nombre && <DR label="Nombre verificado" value={data.nombre} />}
      {data.direccion && <DR label="Dirección" value={data.direccion} />}
      {data.telefono && <DR label="Teléfono" value={data.telefono} />}
      {data.web && <DR label="Sitio web" value={<a href={data.web} target="_blank" rel="noreferrer">{data.web}</a>} />}
      {data.categorias.length > 0 && <DR label="Categorías" value={data.categorias.join(", ")} />}
      {data.rating != null && <DR label="Rating" value={`${data.rating} ★  (${data.total_reviews?.toLocaleString("es-AR")} reseñas)`} />}
      {data.maps_url && (
        <div style={{ gridColumn: "1/-1", marginTop: 8 }}>
          <a href={data.maps_url} target="_blank" rel="noreferrer" className="btn btn--ghost" style={{ fontSize: 12 }}>
            Abrir en Google Maps →
          </a>
        </div>
      )}
    </div>
  );
}

function ApolloContent({
  domain, orgData, peopleData, revealedContacts, revealingId, onLoadPeople, onRevealContact,
}: {
  domain: string;
  orgData?: ApolloOrgResponse;
  peopleData?: ApolloPeopleResponse;
  revealedContacts: Record<string, ApolloRevealResponse>;
  revealingId: string | null;
  onLoadPeople: () => void;
  onRevealContact: (id: string) => void;
}) {
  if (!orgData) return <div className="empty-state" style={{ padding: "12px 0" }}>—</div>;
  if (!orgData.found) return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No se encontró "{domain}" en la base de datos.</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px", marginBottom: 20 }}>
        {orgData.nombre && <DR label="Empresa" value={orgData.nombre} />}
        {orgData.industria && <DR label="Industria" value={orgData.sub_industria ? `${orgData.industria} / ${orgData.sub_industria}` : orgData.industria} />}
        {orgData.descripcion && <DR label="Descripción" value={orgData.descripcion} />}
        {orgData.empleados && <DR label="Empleados" value={orgData.rango_empleados ?? orgData.empleados.toLocaleString("es-AR")} />}
        {orgData.ciudad && <DR label="Ubicación" value={[orgData.ciudad, orgData.estado_provincia, orgData.pais].filter(Boolean).join(", ")} />}
        {orgData.telefono && <DR label="Teléfono" value={orgData.telefono} />}
        {orgData.rango_ingresos && <DR label="Facturación" value={orgData.rango_ingresos} />}
        {orgData.fundacion && <DR label="Fundada" value={String(orgData.fundacion)} />}
        {orgData.tecnologias.length > 0 && <DR label="Tecnologías" value={orgData.tecnologias.slice(0, 6).join(", ")} />}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {orgData.linkedin_url && <a href={orgData.linkedin_url} target="_blank" rel="noreferrer" className="btn btn--ghost" style={{ fontSize: 12 }}>LinkedIn →</a>}
        {orgData.sitio_web && <a href={orgData.sitio_web} target="_blank" rel="noreferrer" className="btn btn--ghost" style={{ fontSize: 12 }}>Sitio web →</a>}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", margin: "0 0 12px" }}>
          Contactos clave
        </p>
        {!peopleData && (
          <button type="button" className="btn" style={{ fontSize: 12 }} onClick={onLoadPeople}>
            Buscar contactos →
          </button>
        )}
        {peopleData && peopleData.contactos.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No se encontraron contactos.</div>
        )}
        {peopleData && peopleData.contactos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {peopleData.contactos.map((c, i) => (
              <ContactoCard
                key={c.apollo_id ?? i}
                contacto={c}
                revealed={c.apollo_id ? revealedContacts[c.apollo_id] : undefined}
                revealing={revealingId === c.apollo_id}
                onReveal={c.apollo_id ? () => onRevealContact(c.apollo_id!) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AfipContent({ data, cuit }: { data?: AfipResponse; cuit: string }) {
  if (!data) return <div className="empty-state" style={{ padding: "12px 0" }}>—</div>;
  if (!data.found) return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>CUIT {cuit} no encontrado en el padrón AFIP.{data.error ? ` ${data.error}` : ""}</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
      {data.razon_social && <DR label="Razón social" value={data.razon_social} />}
      {data.estado && <DR label="Estado" value={data.estado} />}
      {data.tipo_persona && <DR label="Tipo" value={data.tipo_persona} />}
      {data.actividad_principal && <DR label="Actividad" value={data.actividad_principal} />}
      {data.domicilio && <DR label="Domicilio" value={[data.domicilio.calle, data.domicilio.localidad, data.domicilio.provincia].filter(Boolean).join(", ")} />}
      {data.fecha_inicio_actividades && <DR label="Inicio actividades" value={data.fecha_inicio_actividades} />}
      {data.impuestos.length > 0 && <DR label="Inscripto en" value={data.impuestos.join(", ")} />}
    </div>
  );
}

/* ── Row components ──────────────────────────────────────────────── */

function ResultadoRow({
  item, domain, cuit, isExpanded, onSelectTool,
}: {
  item: RecordSummary;
  domain: string;
  cuit: string | null;
  isExpanded: boolean;
  onSelectTool: (savedId: string, tool: ToolTab, domain: string, cuit: string | null) => void;
}) {
  const date = new Date(item.created_at).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  return (
    <tr style={{ background: isExpanded ? "#fefef9" : undefined }}>
      <td style={{ whiteSpace: "nowrap", fontSize: 12, color: "var(--text-muted)" }}>{date}</td>
      <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
        <a href={item.url} target="_blank" rel="noreferrer" title={item.url}>{domain}</a>
      </td>
      <td style={{ textAlign: "right", fontSize: 13 }}>{item.row_count}</td>
      <td style={{ textAlign: "right" }}>
        <RowMenu
          item={item}
          domain={domain}
          cuit={cuit}
          isExpanded={isExpanded}
          onSelectTool={onSelectTool}
        />
      </td>
    </tr>
  );
}

function RowMenu({
  item, domain, cuit, isExpanded, onSelectTool,
}: {
  item: RecordSummary;
  domain: string;
  cuit: string | null;
  isExpanded: boolean;
  onSelectTool: (savedId: string, tool: ToolTab, domain: string, cuit: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function act(fn: () => void) { fn(); setOpen(false); }

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className="btn btn--ghost"
        style={{
          padding: "3px 10px",
          fontSize: 16,
          lineHeight: 1,
          background: isExpanded ? "var(--yellow)" : undefined,
          borderColor: isExpanded ? "var(--yellow)" : undefined,
        }}
        onClick={() => setOpen(!open)}
        aria-label="Herramientas"
      >
        ···
      </button>
      {open && (
        <div className="dropdown__menu">
          <button className="dropdown__item" onClick={() => act(() => onSelectTool(item.saved_id, "detail", domain, cuit))}>
            Datos extraídos
          </button>
          <div className="dropdown__separator" />
          <button className="dropdown__item" onClick={() => act(() => onSelectTool(item.saved_id, "maps", domain, cuit))}>
            Google Maps
          </button>
          <button className="dropdown__item" onClick={() => act(() => onSelectTool(item.saved_id, "apollo", domain, cuit))}>
            Perfil comercial
          </button>
          {cuit && (
            <button className="dropdown__item" onClick={() => act(() => onSelectTool(item.saved_id, "afip", domain, cuit))}>
              AFIP — CUIT {cuit}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Shared sub-components ───────────────────────────────────────── */

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="data-row">
      <span className="data-row__label">{label}</span>
      <span className="data-row__value">{value}</span>
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <div className="loader" style={{ padding: "8px 0" }}>
      <span className="loader__spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function ContactoCard({ contacto, revealed, revealing, onReveal }: {
  contacto: ApolloContacto;
  revealed?: ApolloRevealResponse;
  revealing?: boolean;
  onReveal?: () => void;
}) {
  const data = revealed ?? contacto;
  return (
    <div style={{ padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{data.nombre ?? "Sin nombre"}</span>
          {data.titulo && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{data.titulo}</div>}
        </div>
        {!revealed && onReveal && (
          <button type="button" className="btn btn--ghost" style={{ padding: "1px 8px", fontSize: 11, flexShrink: 0 }} onClick={onReveal} disabled={revealing}>
            {revealing ? "..." : "Revelar"}
          </button>
        )}
        {revealed && <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 700, flexShrink: 0 }}>Revelado</span>}
      </div>
      {(revealed?.email ?? contacto.email) && (
        <a href={`mailto:${revealed?.email ?? contacto.email}`} style={{ fontSize: 12 }}>{revealed?.email ?? contacto.email}</a>
      )}
      {revealed?.emails_personales && revealed.emails_personales.length > 0 && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Personal: {revealed.emails_personales.join(", ")}</span>
      )}
      {(revealed?.linkedin_url ?? contacto.linkedin_url) && (
        <a href={revealed?.linkedin_url ?? contacto.linkedin_url!} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 600 }}>LinkedIn →</a>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20, backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ maxWidth: 700, width: "100%", maxHeight: "88vh", overflowY: "auto", position: "relative", margin: 0, padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)", lineHeight: 1, padding: "0 2px" }} aria-label="Cerrar">✕</button>
        </div>
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
