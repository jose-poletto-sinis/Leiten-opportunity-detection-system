"use client";

interface ResultsTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(formatCell).join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function humanizeColumn(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ResultsTable({ columns, rows }: ResultsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        No se encontraron registros estructurados con esos criterios.
      </div>
    );
  }

  return (
    <div className="table-wrap" role="region" aria-label="Resultados extraídos">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col">
                {humanizeColumn(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col}>{formatCell(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
