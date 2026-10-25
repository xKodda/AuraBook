/** "Barbería Don José" → "barberia-don-jose". Mismo formato que valida la BD. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/.test(slug) && !slug.includes("--");
}
