// Traduce los códigos que lanzan las RPC (`raise exception 'CODIGO'`) a mensajes para el usuario.

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "No tienes permisos para modificar este negocio.",
  UNAUTHENTICATED: "Tu sesión expiró. Vuelve a iniciar sesión.",
  EMAIL_NOT_VERIFIED: "Confirma tu correo electrónico antes de crear un negocio.",
  INVALID_NAME: "Revisa el nombre: debe tener entre 2 y 120 caracteres.",
  INVALID_SLUG: "El enlace solo admite minúsculas, números y guiones (3 a 60 caracteres, sin guion al inicio o al final).",
  SLUG_RESERVED: "Ese enlace no está disponible. Prueba con otro.",
  SLUG_ALREADY_EXISTS: "Ese enlace ya está en uso. Prueba con otro.",
  INVALID_CATEGORY: "Elige el rubro de tu negocio.",
  INVALID_TIMEZONE: "Zona horaria no válida.",
  INVALID_PROFILE: "Algún dato del negocio es demasiado largo.",
  BUSINESS_LIMIT_REACHED: "Alcanzaste el máximo de 3 negocios por cuenta. Escríbenos si necesitas más.",
  INVALID_ROLE_TITLE: "El cargo puede tener hasta 60 caracteres.",
  STAFF_NOT_FOUND: "No encontramos a ese profesional en tu negocio.",
  STAFF_LIMIT_REACHED: "Alcanzaste el máximo de profesionales para este negocio.",
  STAFF_ALREADY_LINKED: "Ese profesional ya está vinculado a otra cuenta.",
  STAFF_HAS_UPCOMING_BOOKINGS: "Este profesional tiene reservas próximas. Reasígnalas o cancélalas antes de quitarlo.",
  INVALID_DESCRIPTION: "La descripción puede tener hasta 300 caracteres.",
  INVALID_PRICE: "Ingresa un precio válido en pesos.",
  INVALID_DURATION: "La duración debe ser de 15 minutos a 8 horas, en bloques de 15 minutos.",
  SERVICE_NOT_FOUND: "No encontramos ese servicio en tu negocio.",
  SERVICE_LIMIT_REACHED: "Alcanzaste el máximo de servicios para este negocio.",
  INVALID_SCHEDULE: "Revisa los horarios: la apertura debe ser antes del cierre y el descanso debe quedar dentro de la jornada.",
  NEEDS_STAFF: "Debes elegir al menos un profesional.",
  NEEDS_SERVICE: "Agrega al menos un servicio antes de publicar.",
  SERVICE_WITHOUT_STAFF: "Cada servicio debe tener al menos un profesional que lo realice.",
  NEEDS_HOURS: "Define el horario de atención antes de publicar.",
  PLAN_NOT_FOUND: "Elige un plan válido.",
  SUBSCRIPTION_NOT_FOUND: "Ese negocio no tiene suscripción.",
  INVALID_AMOUNT: "Ingresa un monto válido.",
  INVALID_MONTHS: "Los meses pagados deben ser entre 1 y 24.",
  INVALID_PAID_AT: "La fecha de pago no puede ser futura.",
  INVALID_METHOD: "Elige un medio de pago.",
  INVALID_DAYS: "Ingresa una cantidad de días válida.",
  INVALID_MAX_STAFF: "El máximo de profesionales debe ser entre 1 y 500, o vacío para sin límite.",
};

const GENERIC = "No pudimos guardar los cambios. Intenta nuevamente.";

export function rpcErrorMessage(message: string | null | undefined): string {
  if (!message) return GENERIC;
  const code = Object.keys(MESSAGES).find((key) => new RegExp(`\\b${key}\\b`).test(message));
  return code ? MESSAGES[code] : GENERIC;
}
