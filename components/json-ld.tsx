// Datos estructurados (schema.org) para buscadores. `<` se escapa: un nombre de negocio no puede cerrar el <script>.
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
