// CSV para abrir en Excel o Google Sheets con configuración chilena: separador «;», UTF-8 con BOM y CRLF.
// Un texto que empieza con = + - @ se toma como fórmula en Excel; se le antepone un apóstrofo para que
// un nombre malicioso no se ejecute al abrir el archivo (inyección de fórmulas).

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "boolean" ? (value ? "Sí" : "No") : String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Teléfono sin «+» inicial: se lee igual y Excel no lo confunde con una fórmula. */
export function csvPhone(phone: string): string {
  return phone.replace(/^\+/, "");
}
