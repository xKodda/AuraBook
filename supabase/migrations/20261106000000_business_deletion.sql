-- ═════════════════════════════════════════════════════════════
-- Eliminar un negocio desde «Mi cuenta» (derecho de supresión; Términos §16)
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. Borra todo lo operativo (reservas y datos de clientes, equipo, servicios, horarios,
-- bloqueos y accesos). Conserva, anonimizado, el registro del negocio con su suscripción y pagos, porque la
-- facturación debe guardarse por obligación tributaria (Política de Privacidad §9). La página deja de existir de
-- inmediato y el enlace queda libre para otro negocio.

alter table public.businesses add column if not exists deleted_at timestamptz;

create or replace function public.delete_business(p_business_id uuid, p_confirm_slug text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_slug text;
  v_logo text;
  v_remaining integer;
begin
  if not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select b.slug, b.logo_url into v_slug, v_logo
  from public.businesses b where b.id = p_business_id and b.deleted_at is null
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- Confirmación explícita: hay que escribir el enlace del negocio.
  if p_confirm_slug is null or lower(trim(p_confirm_slug)) <> v_slug then
    raise exception 'CONFIRMATION_MISMATCH' using errcode = 'P0001';
  end if;

  delete from public.bookings where business_id = p_business_id;
  delete from public.time_off where business_id = p_business_id;
  delete from public.staff_breaks where business_id = p_business_id;
  delete from public.working_hours where business_id = p_business_id;
  delete from public.staff_services where business_id = p_business_id;
  delete from public.services where business_id = p_business_id;
  delete from public.business_members where business_id = p_business_id;
  delete from public.staff where business_id = p_business_id;

  update public.businesses set
    name = 'Negocio eliminado',
    slug = 'eliminado-' || left(replace(id::text, '-', ''), 12),
    tagline = null, description = null, address = null, phone = null, logo_url = null,
    is_active = false, deleted_at = now()
  where id = p_business_id;

  update public.subscriptions set
    cancelled_at = coalesce(cancelled_at, now()),
    notes = left(concat_ws(' · ', notes, 'Negocio eliminado por su dueño el ' || to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD')), 1000)
  where business_id = p_business_id;

  select count(*) into v_remaining from public.business_members m where m.user_id = auth.uid();
  return jsonb_build_object('logoUrl', v_logo, 'remainingBusinesses', v_remaining);
end;
$$;

revoke all on function public.delete_business(uuid, text) from public, anon;
grant execute on function public.delete_business(uuid, text) to authenticated;
