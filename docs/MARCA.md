# AuraBook · Marca

## Isotipo oficial: «Halo»

Un anillo abierto con un punto en la abertura: el aura alrededor de un momento puntual, la cita.

| Archivo (`public/brand/`) | Uso |
|---|---|
| `aurabook-isotipo.svg` | Sobre fondos claros (grafito `#2F3A56`) |
| `aurabook-isotipo-negro.svg` | Impresión en un color, documentos |
| `aurabook-isotipo-blanco.svg` | Sobre fondos oscuros o de color |
| `aurabook-icono.svg` | Ícono de app: símbolo blanco sobre cuadrado grafito con esquinas redondeadas |
| `aurabook-icono-180/192/512.png` | Íconos de iPhone y Android |
| `aurabook-icono-maskable-512.png` | Android (recorte circular; el símbolo queda dentro de la zona segura) |

En el código: `components/aura-mark.tsx` (`<AuraMark />`, toma el color del texto). El favicon (`app/icon.svg`),
el ícono de Apple (`app/apple-icon.png`) y el manifiesto (`app/manifest.ts`) los publica Next automáticamente.

## Colores

| Nombre | Hex | Uso |
|---|---|---|
| Grafito | `#2F3A56` | Color de marca AuraBook |
| Marfil | `#F7F6F2` | Fondo |
| Tinta | `#18191C` | Texto |

Cada negocio usa su propio color en su página de reservas; el color de AuraBook se mantiene en el sitio,
el panel y los íconos de la app.

## Reglas

- No deformar, rotar ni agregar sombras o degradados al isotipo.
- Margen libre alrededor: al menos el diámetro del punto.
- Tamaño mínimo: 16 px en pantalla.
- El nombre se escribe **AuraBook**; en el logotipo, «AURA**BOOK**» en mayúsculas con «BOOK» en el color de marca.
- En correos se usa solo el nombre en texto: Gmail y Outlook no muestran SVG.
