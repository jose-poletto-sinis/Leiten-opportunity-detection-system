"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { searchObras } from "../../lib/api";
import type { ObraResult } from "../../lib/types";
import type { Bounds, MapViewHandle } from "./MapView";

async function geocodeZona(zona: string): Promise<{ lat: number; lng: number; radio_metros: number; bounds: Bounds } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(zona)}&format=json&limit=1&countrycodes=ar&addressdetails=0`;
    const res = await fetch(url, { headers: { "Accept-Language": "es" } });
    const data = await res.json();
    if (!data?.length) return null;
    const r = data[0];
    const [south, north, west, east] = r.boundingbox.map(Number);
    const lat = (north + south) / 2;
    const lng = (east + west) / 2;
    const dlat = (north - south) * 111320;
    const dlng = (east - west) * 111320 * Math.cos(lat * Math.PI / 180);
    const radio_metros = Math.round(Math.sqrt(dlat * dlat + dlng * dlng) / 2);
    return {
      lat, lng, radio_metros,
      bounds: { north, south, east, west },
    };
  } catch {
    return null;
  }
}

const MapView = dynamic(
  () => import("./MapView").then((m) => ({ default: m.MapView })),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 440, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#888" }}>
        Cargando mapa...
      </div>
    ),
  }
);

const BUENOS_AIRES: [number, number] = [-34.6037, -58.3816];

const RADIO_OPTIONS = [
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 20000, label: "20 km" },
];

export default function ObrasPage() {
  const mapRef = useRef<MapViewHandle>(null);
  const [zonaInput, setZonaInput] = useState("");
  const [radio, setRadio] = useState(5000);
  const [center, setCenter] = useState<[number, number]>(BUENOS_AIRES);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const activeBoundsRef = useRef<Bounds | null>(null);
  const [results, setResults] = useState<ObraResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function doSearch(lat: number, lng: number, radioMetros: number) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const resp = await searchObras({ lat, lng, radio_metros: radioMetros });
      const b = activeBoundsRef.current;
      const filtered = b
        ? resp.results.filter(
            (r) =>
              r.lat != null && r.lng != null &&
              r.lat >= b.south && r.lat <= b.north &&
              r.lng >= b.west && r.lng <= b.east
          )
        : resp.results;
      setResults(filtered);
      setSearched(true);
    } catch (err: any) {
      setErrorMsg(err.message ?? "Error al buscar");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!zonaInput.trim()) return;
    setLoading(true);
    const geo = await geocodeZona(zonaInput.trim());
    if (!geo) {
      setLoading(false);
      setErrorMsg("No se encontró la zona. Probá con otra ciudad o dirección.");
      return;
    }
    setCenter([geo.lat, geo.lng]);
    setBounds(geo.bounds);
    activeBoundsRef.current = geo.bounds;
    doSearch(geo.lat, geo.lng, geo.radio_metros);
  }

  function handleMapClick(lat: number, lng: number) {
    setCenter([lat, lng]);
    setBounds(null);
    activeBoundsRef.current = null;
    doSearch(lat, lng, radio);
  }

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Radar de zona</h1>
        <p className="page__subtitle">
          Escribí una zona o hacé clic en el mapa para detectar empresas y actividad constructora en el área.
        </p>
      </header>

      {errorMsg && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: 12 }}>
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      <form className="card" onSubmit={handleSearch} style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="field__label" style={{ fontSize: 12, marginBottom: 4, display: "block" }}>Zona</label>
            <input
              className="input"
              type="text"
              placeholder="Ej: Morón, Palermo, Córdoba Capital"
              value={zonaInput}
              onChange={(e) => setZonaInput(e.target.value)}
            />
          </div>
          <div>
            <label className="field__label" style={{ fontSize: 12, marginBottom: 4, display: "block" }}>Radio (clic en mapa)</label>
            <select
              className="input"
              value={radio}
              onChange={(e) => setRadio(Number(e.target.value))}
            >
              {RADIO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
        <p className="meta-line" style={{ marginTop: 8, marginBottom: 0 }}>
          Al buscar por nombre se usa el contorno real de la zona. Al hacer clic en el mapa se usa el radio seleccionado.
        </p>
      </form>

      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
        <MapView
          ref={mapRef}
          center={center}
          radio={radio}
          bounds={bounds}
          showOverlay={searched}
          results={results}
          onMapClick={handleMapClick}
        />
      </div>

      {loading && (
        <div className="loader" style={{ padding: 16 }}>
          <span className="loader__spinner" aria-hidden="true" />
          <span>Buscando empresas en la zona...</span>
        </div>
      )}

      {!loading && searched && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {results.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              No se encontraron empresas en esta zona. Probá agrandando el radio o buscando en otra área.
            </div>
          ) : (
            <>
              <p className="meta-line" style={{ padding: "10px 16px 0" }}>
                {results.length} resultado{results.length !== 1 ? "s" : ""}
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Dirección</th>
                      <th scope="col">Categorías</th>
                      <th scope="col" style={{ textAlign: "center" }}>Rating</th>
                      <th scope="col" style={{ width: 100 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.place_id}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{r.nombre}</td>
                        <td style={{ fontSize: 12, color: "#666", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.direccion ?? "—"}
                        </td>
                        <td style={{ fontSize: 12 }}>{r.categorias.join(", ") || "—"}</td>
                        <td style={{ textAlign: "center", fontSize: 13 }}>
                          {r.rating ? `${r.rating} ★` : "—"}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {r.lat != null && r.lng != null && (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                style={{ padding: "2px 8px", fontSize: 12 }}
                                onClick={() => mapRef.current?.flyTo(r.lat!, r.lng!, r.place_id)}
                              >
                                Ver
                              </button>
                            )}
                            {r.maps_url && (
                              <a
                                href={r.maps_url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn--ghost"
                                style={{ padding: "2px 8px", fontSize: 12 }}
                              >
                                Maps
                              </a>
                            )}
                            <Link
                              href={`/prospectos?empresa=${encodeURIComponent(r.nombre)}`}
                              className="btn btn--ghost"
                              style={{ padding: "2px 8px", fontSize: 12 }}
                            >
                              Contactos
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
