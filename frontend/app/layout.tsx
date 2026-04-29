import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leiten · Intel Scraper",
  description:
    "Búsqueda inteligente de oportunidades sobre empresas, obras y desarrolladoras.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
