"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "../lib/api";

const TOOLS = [
  { href: "/tareas" as const, label: "Tareas", desc: "Scraping de clientes" },
  { href: "/intel" as const, label: "URL", desc: "URLs monitoreadas" },
  { href: "/obras" as const, label: "Radar", desc: "Búsqueda por zona" },
  { href: "/prospectos" as const, label: "Prospectos", desc: "Contactos y leads" },
];

export function SideBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [nomUsr, setNomUsr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("leiten_intel_user");
      if (raw) setNomUsr(JSON.parse(raw).nom_usr ?? null);
    } catch { /* noop */ }
  }, []);

  async function handleLogout() {
    try { await logout(); } catch { /* noop */ }
    localStorage.removeItem("leiten_intel_token");
    localStorage.removeItem("leiten_intel_user");
    router.replace("/login");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <span className="sidebar__logo-leiten">Leiten</span>
        <span className="sidebar__logo-intel">Intel</span>
      </div>

      <nav className="sidebar__nav">
        <span className="sidebar__section-label">Herramientas</span>
        {TOOLS.map(({ href, label, desc }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link key={href} href={href} className={`sidebar__item${active ? " sidebar__item--active" : ""}`}>
              <span className="sidebar__item-label">{label}</span>
              <span className="sidebar__item-desc">{desc}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__bottom">
        <span className="sidebar__section-label">Sistema</span>
        <Link
          href="/sistemas/prompt"
          className={`sidebar__item${pathname?.startsWith("/sistemas") ? " sidebar__item--active" : ""}`}
        >
          <span className="sidebar__item-label">Config</span>
          <span className="sidebar__item-desc">Prompt del scraping</span>
        </Link>

        {nomUsr && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderTop: "1px solid #e5e7eb" }}>
            <p style={{ margin: 0, fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>
              Sesión
            </p>
            <p style={{ margin: "4px 0 8px", fontSize: 12, color: "#374151", wordBreak: "break-word" }}>
              {nomUsr}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                width: "100%",
                background: "none",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
                color: "#6b7280",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
