"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ObraResult } from "../../lib/types";

const GMAPS_KEY = "AIzaSyAEZzbuUmS1CB1dzFJz_0wS8LQB40O9Bnk";

export interface MapViewHandle {
  flyTo: (lat: number, lng: number, placeId: string) => void;
}

export interface Bounds {
  north: number; south: number; east: number; west: number;
}

interface MapViewProps {
  center: [number, number];
  radio: number;
  bounds: Bounds | null;
  showOverlay: boolean;
  results: ObraResult[];
  onMapClick: (lat: number, lng: number) => void;
}

function loadGMaps(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return;
    if ((window as any).google?.maps) { resolve(); return; }
    const existing = document.getElementById("gmaps-script");
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.id = "gmaps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=geometry`;
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(
  function MapView({ center, radio, bounds, showOverlay, results, onMapClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const circleRef = useRef<google.maps.Circle | null>(null);
    const rectRef = useRef<google.maps.Rectangle | null>(null);
    const centerMarkerRef = useRef<google.maps.Marker | null>(null);
    const onClickRef = useRef(onMapClick);
    onClickRef.current = onMapClick;

    useImperativeHandle(ref, () => ({
      flyTo(lat: number, lng: number, placeId: string) {
        if (!mapRef.current) return;
        mapRef.current.panTo({ lat, lng });
        mapRef.current.setZoom(16);
        const marker = markersRef.current.get(placeId);
        if (marker && infoWindowRef.current) {
          setTimeout(() => {
            infoWindowRef.current!.open({ map: mapRef.current, anchor: marker });
          }, 400);
        }
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      loadGMaps().then(() => {
        const g = (window as any).google.maps as typeof google.maps;

        if (!mapRef.current) {
          mapRef.current = new g.Map(containerRef.current!, {
            center: { lat: center[0], lng: center[1] },
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
          });
          infoWindowRef.current = new g.InfoWindow();
          mapRef.current.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (e.latLng) onClickRef.current(e.latLng.lat(), e.latLng.lng());
          });
        }

        // Limpiar marcadores y formas anteriores
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current.clear();
        if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
        if (rectRef.current) { rectRef.current.setMap(null); rectRef.current = null; }
        if (centerMarkerRef.current) { centerMarkerRef.current.setMap(null); centerMarkerRef.current = null; }

        if (showOverlay && bounds) {
          // Modo zona: rectángulo con los límites reales del lugar
          const gmBounds = new g.LatLngBounds(
            { lat: bounds.south, lng: bounds.west },
            { lat: bounds.north, lng: bounds.east }
          );
          mapRef.current.fitBounds(gmBounds, 32);
          rectRef.current = new g.Rectangle({
            bounds: gmBounds,
            map: mapRef.current,
            strokeColor: "#f5c800",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: "#f5c800",
            fillOpacity: 0.08,
          });
        } else if (showOverlay) {
          // Modo clic: marcador central + círculo
          mapRef.current.setCenter({ lat: center[0], lng: center[1] });
          mapRef.current.setZoom(13);
          centerMarkerRef.current = new g.Marker({
            position: { lat: center[0], lng: center[1] },
            map: mapRef.current,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: "#f5c800",
              fillOpacity: 1,
              strokeColor: "#111111",
              strokeWeight: 2,
            },
            zIndex: 1000,
          });
          circleRef.current = new g.Circle({
            center: { lat: center[0], lng: center[1] },
            radius: radio,
            map: mapRef.current,
            strokeColor: "#f5c800",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: "#f5c800",
            fillOpacity: 0.08,
          });
        }

        // Marcadores de resultados
        results.forEach((r) => {
          if (r.lat == null || r.lng == null) return;
          const marker = new g.Marker({
            position: { lat: r.lat, lng: r.lng },
            map: mapRef.current,
            title: r.nombre,
          });
          const content = `
            <div style="font-size:13px;max-width:240px;line-height:1.6">
              <b>${r.nombre}</b><br>
              <span style="color:#666;font-size:12px">${r.direccion ?? ""}</span>
              ${r.rating ? `<br><span style="font-size:12px">${r.rating} ★ (${r.total_reviews ?? 0})</span>` : ""}
              ${r.maps_url ? `<br><a href="${r.maps_url}" target="_blank" rel="noreferrer" style="font-size:12px;color:#1a73e8">Ver en Google Maps →</a>` : ""}
            </div>`;
          marker.addListener("click", () => {
            infoWindowRef.current!.setContent(content);
            infoWindowRef.current!.open({ map: mapRef.current, anchor: marker });
          });
          markersRef.current.set(r.place_id, marker);
        });
      });
    }, [center, radio, bounds, showOverlay, results]);

    return <div ref={containerRef} style={{ height: 440, width: "100%" }} />;
  }
);
