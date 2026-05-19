"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: "/intel" | "/resultados" | "/obras" | "/prospectos" | "/sistemas/prompt"; label: string }[] = [
  { href: "/intel", label: "Fuentes" },
  { href: "/resultados", label: "Empresas" },
  { href: "/obras", label: "Radar" },
  { href: "/prospectos", label: "Prospectos" },
  { href: "/sistemas/prompt", label: "Config" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="navbar">
      <Link href="/" className="navbar__logo">Leiten Intel</Link>
      <div className="navbar__links">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`navbar__link${pathname?.startsWith(href) ? " navbar__link--active" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
