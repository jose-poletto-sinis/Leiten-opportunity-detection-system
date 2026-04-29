import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Leiten · Búsqueda inteligente</h1>
        <p className="page__subtitle">
          Identificá oportunidades de negocio sobre empresas, obras y desarrolladoras.
        </p>
      </header>
      <div className="card">
        <p>
          Ir a la pantalla de extracción:{" "}
          <Link href="/intel">/intel</Link>
        </p>
      </div>
    </main>
  );
}
