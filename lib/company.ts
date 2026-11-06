// Datos de la empresa detrás de AuraBook: footer, /nosotros y botón de WhatsApp. Se puede importar desde componentes cliente.

export const COMPANY = {
  legalName: "Clikium SpA",
  rut: "78.399.278-7",
  city: "Santiago, Chile",
  email: "contacto@clikium.cl",
  whatsappDisplay: "+56 9 7878 5893",
  /** Sin «+» ni espacios, como lo pide wa.me. */
  whatsappNumber: "56978785893",
  hours: "todos los días, a toda hora",
  founder: "Christofer Godoy Cerda",
} as const;

export const WHATSAPP_MESSAGE = "Hola, vi AuraBook y quiero saber si me sirve para mi negocio de ______";

export function whatsappUrl(text = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${COMPANY.whatsappNumber}?text=${encodeURIComponent(text)}`;
}
