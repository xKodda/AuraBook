// Páginas por rubro (/para/[rubro]) para buscadores: cada una apunta a cómo busca ese negocio una agenda online.
import type { BusinessCategory } from "./types";

export type RubroPage = {
  slug: string;
  category: Exclude<BusinessCategory, "otro">;
  /** Nombre en plural para listas y enlaces («Talleres mecánicos»). */
  name: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  /** Problemas concretos que resuelve, en el idioma del rubro. */
  points: { title: string; text: string }[];
  faq: { q: string; a: string }[];
};

export const RUBRO_PAGES: RubroPage[] = [
  {
    slug: "barberias", category: "barberia", name: "Barberías",
    title: "Agenda online para barberías",
    description: "Página de reservas para tu barbería: tus clientes eligen barbero, corte y hora desde el celular, sin llamar ni crear cuenta. Prueba gratis.",
    h1: "Agenda online para tu barbería",
    lead: "Tus clientes reservan corte, barba o perfilado con el barbero que prefieren, a cualquier hora. Tú dejas de responder mensajes para coordinar.",
    points: [
      { title: "Cada barbero con su agenda", text: "Horario, descansos y servicios propios para cada uno, sin horas cruzadas." },
      { title: "El corte dura lo que dura", text: "45 minutos un corte, 60 corte y barba: la agenda respeta la duración real." },
      { title: "Menos sillas vacías", text: "Recordatorio por correo el día antes y cancelación desde el enlace del cliente." },
    ],
    faq: [
      { q: "¿Mis clientes pueden elegir a su barbero?", a: "Sí. Pueden elegir un barbero en particular o «cualquiera» para ver todas las horas libres." },
      { q: "¿Sirve si trabajo solo?", a: "Sí. El plan Free alcanza para un barbero independiente y no pide tarjeta." },
    ],
  },
  {
    slug: "peluquerias", category: "peluqueria", name: "Peluquerías",
    title: "Sistema de reservas para peluquerías",
    description: "Agenda online para peluquerías: corte, color y brushing con su duración real y cada estilista con su horario. Tus clientes reservan desde el celular.",
    h1: "Reservas online para tu peluquería",
    lead: "Corte, coloración o mechas: cada servicio con su tiempo exacto, para que la agenda de cada estilista nunca se cruce.",
    points: [
      { title: "Servicios largos sin enredos", text: "Una coloración de 2 horas bloquea solo lo necesario, sin tapar otras horas." },
      { title: "Cada estilista con sus servicios", text: "Quien no hace color no aparece al reservar coloración." },
      { title: "Tu marca en la página", text: "Tu logo y, con Premium, tus colores en la página que ven tus clientes." },
    ],
    faq: [
      { q: "¿Puedo poner servicios de distinta duración?", a: "Sí. Cada servicio tiene su duración y precio, y la disponibilidad se calcula con eso." },
      { q: "¿Mis clientes tienen que descargar una app?", a: "No. Reservan desde el navegador del celular, sin cuenta ni contraseña." },
    ],
  },
  {
    slug: "salones-de-unas", category: "unas", name: "Salones de uñas",
    title: "Agenda online para manicure y salones de uñas",
    description: "Reservas online para manicuristas y salones de uñas: semipermanente, acrílicas y pedicure con su duración real. Sin mensajes para coordinar.",
    h1: "Agenda online para tu salón de uñas",
    lead: "Semipermanente, acrílicas o pedicure: tus clientas eligen servicio y hora, y tú ves tu día ordenado.",
    points: [
      { title: "Duración por servicio", text: "Acrílicas de 2 horas y un retiro de 30 minutos conviven sin cruzarse." },
      { title: "Varias manicuristas", text: "Cada una con su horario y los servicios que realiza." },
      { title: "Menos inasistencias", text: "Recordatorio por correo y control de ausencias con Premium." },
    ],
    faq: [
      { q: "¿Puedo bloquear horas en las que no atiendo?", a: "Sí. Puedes bloquear días u horas puntuales y quedan fuera de la página de reservas." },
      { q: "¿Cuánto cuesta?", a: "Puedes empezar gratis. Premium agrega más reservas, tus colores y control de inasistencias." },
    ],
  },
  {
    slug: "spa", category: "spa", name: "Spa y masajes",
    title: "Reservas online para spa y masajes",
    description: "Agenda online para spa, masoterapeutas y centros de bienestar: masajes y sesiones largas bien repartidas, reservadas desde el celular.",
    h1: "Reservas online para tu spa",
    lead: "Masajes, drenajes y sesiones largas repartidas sin huecos ni choques, con cada terapeuta en su horario.",
    points: [
      { title: "Sesiones largas, bien repartidas", text: "La agenda respeta la duración de cada tratamiento y los descansos." },
      { title: "Terapeutas con su agenda", text: "Cada profesional con sus servicios y su horario semanal." },
      { title: "Reserva en un minuto", text: "Sin crear cuenta: nombre, teléfono y listo." },
    ],
    faq: [
      { q: "¿Puedo ofrecer horas cada 30 minutos?", a: "Sí. Eliges si las horas se ofrecen cada hora, cada 30 o cada 15 minutos." },
      { q: "¿Cómo me entero de una reserva nueva?", a: "Te llega un correo con los datos del cliente apenas reserva, y puedes activar avisos en tu teléfono." },
    ],
  },
  {
    slug: "centros-de-estetica", category: "estetica", name: "Centros de estética",
    title: "Agenda online para centros de estética",
    description: "Sistema de reservas para centros de estética y cosmetología: limpiezas faciales, pestañas y depilación con su tiempo exacto.",
    h1: "Agenda online para tu centro de estética",
    lead: "Limpiezas faciales, lifting de pestañas o depilación: cada tratamiento con su duración y cada especialista con su horario.",
    points: [
      { title: "Tratamientos con su tiempo", text: "La disponibilidad se calcula con la duración exacta de cada servicio." },
      { title: "Especialistas ordenadas", text: "Cada una aparece solo en los servicios que realiza." },
      { title: "Recordatorio automático", text: "El cliente puede pedir un recordatorio por correo el día antes." },
    ],
    faq: [
      { q: "¿Puedo mostrar precios?", a: "Sí. Cada servicio muestra su precio y duración en tu página de reservas." },
      { q: "¿Mis datos están seguros?", a: "Cada negocio está separado del resto en la base de datos y solo tu equipo ve tus reservas." },
    ],
  },
  {
    slug: "talleres-mecanicos", category: "automotriz", name: "Talleres mecánicos",
    title: "Agenda online para talleres mecánicos",
    description: "Sistema de reservas para talleres mecánicos: tus clientes agendan mantención, cambio de aceite o diagnóstico desde el celular. Prueba gratis.",
    h1: "Agenda online para tu taller mecánico",
    lead: "Cambio de aceite, mantenciones o diagnóstico con scanner: tus clientes eligen la hora y llegan cuando tienes espacio, no todos a la vez.",
    points: [
      { title: "Sin autos esperando en la puerta", text: "Cada trabajo ocupa su tiempo real y el taller recibe solo lo que puede atender." },
      { title: "Mecánicos con su agenda", text: "Asigna qué servicios hace cada mecánico y su horario." },
      { title: "Horas enteras", text: "Ofrece horas a las 9:00, 10:00, 11:00… como trabaja un taller." },
    ],
    faq: [
      { q: "¿Sirve para un taller pequeño?", a: "Sí. El plan Free alcanza para un equipo pequeño y no pide tarjeta; pasas a Premium solo si lo necesitas." },
      { q: "¿El cliente puede cancelar?", a: "Sí, desde el enlace que recibe, dentro del plazo de cancelación que tú defines." },
    ],
  },
  {
    slug: "consultas-de-salud", category: "salud", name: "Consultas de salud",
    title: "Agenda online para consultas de salud",
    description: "Reservas online para kinesiólogos, psicólogos, nutricionistas y dentistas: tus pacientes agendan su hora desde el celular, sin llamar.",
    h1: "Agenda online para tu consulta",
    lead: "Kinesiología, psicología, nutrición o dental: tus pacientes reservan su hora a cualquier momento y tú atiendes sin interrupciones del teléfono.",
    points: [
      { title: "Primera consulta y controles", text: "Duraciones distintas para cada tipo de atención." },
      { title: "Varios profesionales", text: "Cada uno con su horario, descansos y bloqueos por vacaciones." },
      { title: "Menos inasistencias", text: "Recordatorio por correo el día antes y registro de ausencias." },
    ],
    faq: [
      { q: "¿Mis pacientes necesitan crear una cuenta?", a: "No. Dejan su nombre y teléfono, y reciben un enlace para ver o cancelar su hora." },
      { q: "¿Quién puede ver los datos de mis pacientes?", a: "Solo tu equipo. Cada consulta está separada del resto a nivel de base de datos." },
    ],
  },
  {
    slug: "veterinarias", category: "veterinaria", name: "Veterinarias",
    title: "Agenda online para veterinarias y peluquería canina",
    description: "Sistema de reservas para veterinarias y peluquerías caninas: consultas, vacunas y baños agendados desde el celular, con recordatorio.",
    h1: "Agenda online para tu veterinaria",
    lead: "Consultas, vacunas, controles o baño y corte: los dueños reservan la hora de su mascota sin llamar.",
    points: [
      { title: "Consulta y peluquería en un lugar", text: "Veterinarios y peluqueros, cada uno con sus servicios y horario." },
      { title: "Recordatorio para el dueño", text: "Un correo el día antes para que no se olvide la vacuna." },
      { title: "Tu agenda ordenada", text: "Ves el día completo por profesional desde el celular o el computador." },
    ],
    faq: [
      { q: "¿Puedo ofrecer servicios cortos como vacunas?", a: "Sí. Puedes crear servicios desde 15 minutos y elegir cada cuánto se ofrecen las horas." },
      { q: "¿Necesito instalar algo?", a: "No. Funciona en el navegador, para ti y para tus clientes." },
    ],
  },
  {
    slug: "abogados-y-asesorias", category: "profesional", name: "Abogados y asesorías",
    title: "Agenda online para abogados, contadores y asesores",
    description: "Reservas online para abogados, contadores y asesorías: tus clientes agendan su reunión desde tu enlace, sin coordinar por correo.",
    h1: "Agenda online para abogados y asesorías",
    lead: "Primeras reuniones, asesorías legales o contables y seguimientos: tus clientes eligen la hora y tú dejas de coordinar por correo.",
    points: [
      { title: "Reuniones a tu hora", text: "Ofrece solo los bloques que tú defines, cada hora o cada 30 minutos." },
      { title: "Socios y asistentes", text: "Cada profesional con su agenda y los tipos de reunión que atiende." },
      { title: "Imagen profesional", text: "Tu logo y tus colores en una página de reservas propia." },
    ],
    faq: [
      { q: "¿Puedo pedir anticipación mínima?", a: "Sí. Defines con cuánta anticipación se puede reservar y hasta cuántos días hacia adelante." },
      { q: "¿Emiten factura?", a: "Sí. AuraBook es de Clikium SpA y emitimos boleta o factura." },
    ],
  },
  {
    slug: "entrenadores", category: "deporte", name: "Entrenadores y estudios",
    title: "Agenda online para entrenadores personales y estudios",
    description: "Reservas online para entrenadores personales, estudios de yoga y pilates: tus alumnos agendan su sesión desde el celular.",
    h1: "Agenda online para entrenadores y estudios",
    lead: "Entrenamiento personal, evaluaciones o clases de yoga: tus alumnos reservan su sesión y tú llegas con la agenda clara.",
    points: [
      { title: "Sesiones a horas enteras", text: "Ofrece las 7:00, 8:00, 9:00… o cada 30 minutos, como prefieras." },
      { title: "Varios instructores", text: "Cada uno con sus clases y su horario semanal." },
      { title: "Cancelación con reglas", text: "El alumno cancela desde su enlace, dentro del plazo que tú decides." },
    ],
    faq: [
      { q: "¿Sirve para clases grupales?", a: "Hoy cada hora se reserva para una persona. Para clases grupales puedes usarlo como registro de horas por alumno." },
      { q: "¿Cuánto cuesta?", a: "Puedes empezar gratis y pasar a Premium cuando necesites más reservas o profesionales." },
    ],
  },
  {
    slug: "clases-particulares", category: "clases", name: "Clases particulares",
    title: "Agenda online para profesores y clases particulares",
    description: "Reservas online para profesores particulares, tutorías, música e idiomas: tus alumnos eligen la hora desde tu enlace.",
    h1: "Agenda online para clases particulares",
    lead: "Reforzamiento escolar, música o idiomas: tus alumnos (o sus apoderados) reservan la clase sin ir y venir de mensajes.",
    points: [
      { title: "Tu horario, tus reglas", text: "Marcas los días y horas en que haces clases y nada más aparece." },
      { title: "Varios profesores", text: "Cada profesor con sus asignaturas y su agenda." },
      { title: "Recordatorio de la clase", text: "Correo el día antes para que nadie se olvide." },
    ],
    faq: [
      { q: "¿Puedo dar clases de distinta duración?", a: "Sí. Cada tipo de clase tiene su duración y precio." },
      { q: "¿Tengo que tener local?", a: "No. La dirección es opcional; sirve igual para clases online o a domicilio." },
    ],
  },
  {
    slug: "estudios-de-tatuajes", category: "tatuajes", name: "Estudios de tatuajes",
    title: "Agenda online para estudios de tatuajes",
    description: "Reservas online para tatuadores y estudios de tatuajes: evaluaciones, sesiones largas y piercing agendados desde el celular.",
    h1: "Agenda online para tu estudio de tatuajes",
    lead: "Evaluaciones, sesiones largas o piercing: cada artista con su agenda y cada sesión con su tiempo real.",
    points: [
      { title: "Sesiones largas sin choques", text: "Una sesión de 3 horas bloquea justo ese tiempo." },
      { title: "Cada artista con su agenda", text: "Tus clientes eligen al tatuador que quieren." },
      { title: "Tu estética", text: "Tu logo y tus colores en tu página de reservas." },
    ],
    faq: [
      { q: "¿Puedo ofrecer una evaluación previa?", a: "Sí. Crea un servicio de evaluación de 30 minutos y tus clientes la reservan antes de la sesión." },
      { q: "¿Mis clientes tienen que registrarse?", a: "No. Reservan con su nombre y teléfono." },
    ],
  },
  {
    slug: "fotografos", category: "fotografia", name: "Fotógrafos",
    title: "Agenda online para fotógrafos y estudios de fotografía",
    description: "Reservas online para fotógrafos y estudios: sesiones de retrato, producto y foto carnet agendadas desde tu enlace.",
    h1: "Agenda online para fotógrafos",
    lead: "Retratos, fotos de producto o foto carnet: tus clientes reservan su sesión con hora confirmada.",
    points: [
      { title: "Sesiones con su duración", text: "Desde una foto carnet de 15 minutos hasta sesiones de varias horas." },
      { title: "Tu estudio ordenado", text: "Fotógrafos y asistentes con su propio horario." },
      { title: "Página con tu marca", text: "Un enlace propio para compartir en Instagram o WhatsApp." },
    ],
    faq: [
      { q: "¿Puedo compartir mi enlace en Instagram?", a: "Sí. Tu página de reservas tiene un enlace propio para tu bio, WhatsApp o Google Maps." },
      { q: "¿Cuánto cuesta?", a: "Puedes empezar gratis, sin tarjeta." },
    ],
  },
];

export const rubroBySlug = (slug: string) => RUBRO_PAGES.find((r) => r.slug === slug);
export const rubroForCategory = (category: BusinessCategory) => RUBRO_PAGES.find((r) => r.category === category);
