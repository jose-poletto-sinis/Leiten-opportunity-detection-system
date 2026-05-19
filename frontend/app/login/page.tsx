"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "../../lib/api";

export default function LoginPage() {
  const [codUsr, setCodUsr] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await login(codUsr.trim(), password);
      localStorage.setItem("leiten_intel_token", result.session_id);
      localStorage.setItem(
        "leiten_intel_user",
        JSON.stringify({ cod_usr: result.cod_usr, nom_usr: result.nom_usr }),
      );
      router.replace("/resultados");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f4f6",
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 360, padding: "40px 32px" }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>
            <span style={{ color: "#111" }}>Leiten</span>
            <span style={{ color: "#eab308", marginLeft: 4 }}>Intel</span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>
            Ingresá con tu usuario del ERP
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              Usuario
            </label>
            <input
              className="input"
              type="text"
              value={codUsr}
              onChange={(e) => setCodUsr(e.target.value)}
              placeholder="Número de usuario"
              autoComplete="username"
              required
              disabled={loading}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              Contraseña
            </label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              disabled={loading}
              style={{ width: "100%" }}
            />
          </div>

          {error && (
            <div
              className="banner banner--error"
              role="alert"
              style={{ padding: "8px 12px", fontSize: 13 }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn"
            disabled={loading || !codUsr || !password}
            style={{ marginTop: 4, width: "100%", justifyContent: "center" }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
