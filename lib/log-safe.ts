// Registro sin datos personales (auditoría P1-07). Los logs de Vercel no deben guardar nombres, correos, teléfonos ni
// tokens de clientes: se registra qué falló (etiqueta, código, mensaje técnico) y con datos personales ocultos.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Teléfonos: 8 o más dígitos, con +, espacios o guiones entre ellos.
const PHONE = /\+?\d[\d\s-]{6,}\d/g;
// Tokens de gestión de reservas y llaves largas.
const TOKEN = /\b[0-9a-f]{32,}\b|\b(?:re|sk|sb)_[A-Za-z0-9_]{8,}\b/gi;

/** Oculta correos, teléfonos y tokens en un texto técnico (por ejemplo, la respuesta de un proveedor). */
export function redact(text: string, max = 300): string {
  return text.replace(EMAIL, "[correo]").replace(TOKEN, "[token]").replace(PHONE, "[teléfono]").slice(0, max);
}

/** Resumen de un error para el log: nombre, código y mensaje redactado; nunca el objeto completo ni sus detalles. */
export function safeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return `${error.name}${code ? ` [${String(code)}]` : ""}: ${redact(error.message)}`;
  }
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    return `${e.code ? `[${String(e.code)}] ` : ""}${redact(String(e.message ?? "error sin mensaje"))}`;
  }
  return redact(String(error));
}
