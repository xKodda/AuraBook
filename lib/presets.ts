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
  automotriz: ["Mecánico", "Jefe de taller", "Electromecánico", "Desabollador/pintor", "Recepción"],
  salud: ["Kinesiólogo/a", "Psicólogo/a", "Nutricionista", "Dentista", "Fonoaudiólogo/a", "Médico/a"],
  veterinaria: ["Médico veterinario", "Peluquero canino", "Técnico veterinario", "Recepción"],
  profesional: ["Abogado/a", "Contador/a", "Asesor/a", "Socio/a", "Asistente"],
  deporte: ["Entrenador/a personal", "Preparador físico", "Instructor/a", "Profesor/a de yoga"],
  clases: ["Profesor/a", "Tutor/a", "Instructor/a", "Profesor/a de música"],
  tatuajes: ["Tatuador/a", "Piercer", "Aprendiz"],
  fotografia: ["Fotógrafo/a", "Asistente", "Editor/a"],
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
  automotriz: [
    { name: "Diagnóstico / scanner", durationMin: 60 },
    { name: "Cambio de aceite y filtros", durationMin: 60 },
    { name: "Mantención por kilometraje", durationMin: 120 },
    { name: "Revisión de frenos", durationMin: 60 },
    { name: "Alineación y balanceo", durationMin: 60 },
    { name: "Revisión pre revisión técnica", durationMin: 60 },
  ],
  salud: [
    { name: "Primera consulta", durationMin: 60 },
    { name: "Control", durationMin: 30 },
    { name: "Sesión de kinesiología", durationMin: 45 },
    { name: "Sesión de psicología", durationMin: 60 },
    { name: "Evaluación nutricional", durationMin: 60 },
  ],
  veterinaria: [
    { name: "Consulta general", durationMin: 30 },
    { name: "Vacunación", durationMin: 15 },
    { name: "Control sano", durationMin: 30 },
    { name: "Baño y corte", durationMin: 90 },
    { name: "Desparasitación", durationMin: 15 },
  ],
  profesional: [
    { name: "Primera reunión", durationMin: 60 },
    { name: "Asesoría legal", durationMin: 60 },
    { name: "Asesoría contable / tributaria", durationMin: 60 },
    { name: "Reunión de seguimiento", durationMin: 30 },
  ],
  deporte: [
    { name: "Entrenamiento personal", durationMin: 60 },
    { name: "Evaluación física", durationMin: 60 },
    { name: "Clase de yoga", durationMin: 60 },
    { name: "Clase grupal", durationMin: 60 },
  ],
  clases: [
    { name: "Clase particular", durationMin: 60 },
    { name: "Reforzamiento escolar", durationMin: 60 },
    { name: "Clase de música", durationMin: 60 },
    { name: "Clase de idiomas", durationMin: 60 },
  ],
  tatuajes: [
    { name: "Evaluación / cotización", durationMin: 30 },
    { name: "Tatuaje pequeño", durationMin: 60 },
    { name: "Sesión de tatuaje", durationMin: 180 },
    { name: "Piercing", durationMin: 30 },
  ],
  fotografia: [
    { name: "Sesión de retrato", durationMin: 60 },
    { name: "Fotos de producto", durationMin: 120 },
    { name: "Sesión familiar", durationMin: 90 },
    { name: "Foto carnet", durationMin: 15 },
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
  automotriz: ["Tu auto en buenas manos.", "Mantención sin esperas.", "Mecánica honesta, a tu hora."],
  salud: ["Tu salud, a tu hora.", "Atención cercana y profesional.", "Cuidamos de ti."],
  veterinaria: ["Tu mascota, bien cuidada.", "Cuidado con cariño.", "Salud para tu regalón."],
  profesional: ["Asesoría experta, a tu hora.", "Resolvemos contigo.", "Confianza y claridad."],
  deporte: ["Tu mejor marca empieza aquí.", "Entrena con propósito.", "Constancia que se nota."],
  clases: ["Aprender empieza aquí.", "Clases a tu ritmo.", "Aprende con quien sabe."],
  tatuajes: ["Tu idea, en tu piel.", "Arte con oficio.", "Diseños únicos."],
  fotografia: ["Momentos que quedan.", "Cada toma cuenta.", "Tu historia en imágenes."],
  otro: ["Tu próxima visita empieza aquí.", "Agenda en segundos."],
};
