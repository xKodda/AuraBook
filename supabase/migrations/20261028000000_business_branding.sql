-- AuraBook · Marca del negocio: logotipo y color
-- Aditiva y no destructiva.
--
-- Logos: bucket público `business-logos` en Supabase Storage, una carpeta por negocio (<business_id>/…).
-- No hay políticas de escritura para anon/authenticated: el servidor sube el archivo con la clave
-- secreta después de verificar el rol, y guarda la URL con `set_business_logo`, que vuelve a verificarlo.

-- ─────────────────────────────────────────────────────────────
-- 1. Bucket (solo si existe Supabase Storage; en las pruebas con PGlite no existe)
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage')
    and exists (select 1 from pg_catalog.pg_tables where schemaname = 'storage' and tablename = 'buckets')
  then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('business-logos', 'business-logos', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Logo (owner/admin). La URL debe apuntar a la carpeta del propio negocio en el bucket.
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_business_logo(p_business_id uuid, p_logo_url text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_logo_url is not null and (
    length(p_logo_url) > 500
    or p_logo_url !~ ('^https://[a-z0-9.-]+/storage/v1/object/public/business-logos/'
                      || p_business_id::text || '/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$')
  ) then
    raise exception 'INVALID_LOGO' using errcode = 'P0001';
  end if;
  update public.businesses set logo_url = p_logo_url where id = p_business_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Color de marca (owner/admin)
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_business_brand_color(p_business_id uuid, p_brand_color text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_brand_color is null or p_brand_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'INVALID_COLOR' using errcode = 'P0001';
  end if;
  update public.businesses set brand_color = upper(p_brand_color) where id = p_business_id;
end;
$$;

revoke all on function
  public.set_business_logo(uuid, text),
  public.set_business_brand_color(uuid, text)
from public, anon;

grant execute on function
  public.set_business_logo(uuid, text),
  public.set_business_brand_color(uuid, text)
to authenticated;
