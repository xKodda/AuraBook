// Opciones sugeridas para el onboarding, según el rubro. Siempre existe «Otro» para escribir.
import type { BusinessCategory } from "./types";

/** Colores de marca mate. El texto sobre ellos se ajusta solo (brandStyle). */
export const BRAND_COLORS: { hex: string; name: string }[] = [
  { hex: "#2F3A56", name: "Grafito" },
  { hex: "#2B2B2B", name: "Carbón" },
  { hex: "#4A5560", name: "Pizarra" },
  { hex: "#2F5D62", name: "Petróleo" },
  { hex: "#5A6B4E", name: "Oliva" },
  { hex: "#9A6B3F", name: "Tabaco" },
  { hex: "#A0563B", name: "Terracota" },
  { hex: "#A88B64", name: "Arena" },
  { hex: "#7A4A63", name: "Ciruela" },
  { hex: "#B4577A", name: "Rosa antiguo" },
];

export const ROLE_TITLES: Record<BusinessCategory, string[]> = {
  barberia: ["Barbero", "Barbero senior", "Barbero junior", "Aprendiz"],
  peluqueria: ["Estilista", "Estilista senior", "Colorista", "Peluquero/a", "Asistente"],
  unas: ["Manicurista", "Nail artist", "Pedicurista", "Asistente"],
  spa: ["Masoterapeuta", "Terapeuta", "Esteticista", "Recepción"],
  estetica: ["Esteticista", "Cosmetóloga", "Especialista en pestañas", "Depiladora"],
  otro: ["Profesional", "Especialista", "Asistente"],
};

export type ServicePreset = { name: string; durationMin: number };

export const SERVICE_PRESETS: Record<BusinessCategory, ServicePreset[]> = {
  barberia: [
    { name: "Corte de pelo", durationMin: 45 },
    { name: "Corte + barba", durationMin: 60 },
    { name: "Perfilado de barba", durationMin: 30 },
    { name: "Corte infantil", durationMin: 30 },
    { name: "Afeitado clásico", durationMin: 30 },
    { name: "Black mask", durationMin: 30 },
    { name: "Diseño / líneas", durationMin: 15 },
  ],
  peluqueria: [
    { name: "Corte de pelo", durationMin: 45 },
    { name: "Corte y brushing", durationMin: 60 },
    { name: "Brushing", durationMin: 45 },
    { name: "Coloración", durationMin: 120 },
    { name: "Mechas / balayage", durationMin: 180 },
    { name: "Alisado", durationMin: 180 },
    { name: "Peinado", durationMin: 60 },
  ],
  unas: [
    { name: "Manicure tradicional", durationMin: 45 },
    { name: "Manicure semipermanente", durationMin: 60 },
    { name: "Uñas acrílicas", durationMin: 120 },
    { name: "Uñas polygel", durationMin: 105 },
    { name: "Pedicure", durationMin: 60 },
    { name: "Retiro", durationMin: 30 },
  ],
  spa: [
    { name: "Masaje relajante", durationMin: 60 },
    { name: "Masaje descontracturante", durationMin: 60 },
    { name: "Masaje con piedras calientes", durationMin: 75 },
    { name: "Drenaje linfático", durationMin: 60 },
    { name: "Limpieza facial", durationMin: 60 },
  ],
  estetica: [
    { name: "Limpieza facial", durationMin: 60 },
    { name: "Lifting de pestañas", durationMin: 60 },
    { name: "Extensión de pestañas", durationMin: 120 },
    { name: "Diseño de cejas", durationMin: 30 },
    { name: "Depilación", durationMin: 30 },
  ],
  otro: [
    { name: "Consulta", durationMin: 30 },
    { name: "Sesión", durationMin: 60 },
  ],
};

export const TAGLINES: Record<BusinessCategory, string[]> = {
  barberia: ["Un buen corte empieza aquí.", "Tu estilo, a tu ritmo.", "Cortes clásicos y modernos.", "Barbería de barrio, con oficio."],
  peluqueria: ["Tu nuevo look empieza aquí.", "Color, corte y brillo propio.", "Estilo que se nota."],
  unas: ["Detalles que se notan.", "Manos impecables, sin apuros.", "Diseños a tu medida."],
  spa: ["Un respiro empieza aquí.", "Tiempo para ti.", "Relájate, nosotros nos encargamos."],
  estetica: ["Cuidarte empieza aquí.", "Tu mejor versión, natural.", "Cuidado profesional."],
  otro: ["Tu próxima visita empieza aquí.", "Agenda en segundos."],
};
