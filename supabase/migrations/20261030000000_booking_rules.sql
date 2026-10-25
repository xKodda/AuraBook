-- AuraBook · Reglas de reserva editables desde el panel
-- Aditiva y no destructiva. Las columnas existen desde 20261023000000; solo faltaba poder editarlas.

create or replace function public.update_booking_rules(
  p_business_id uuid,
  p_min_notice_min integer,
  p_max_days_ahead integer,
  p_cancel_notice_min integer
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_min_notice_min is null or p_min_notice_min not between 0 and 2880
    or p_max_days_ahead is null or p_max_days_ahead not between 1 and 180
    or p_cancel_notice_min is null or p_cancel_notice_min not between 0 and 2880
  then
    raise exception 'INVALID_RULES' using errcode = 'P0001';
  end if;
  update public.businesses set
    min_notice_min = p_min_notice_min,
    max_days_ahead = p_max_days_ahead,
    cancel_notice_min = p_cancel_notice_min
  where id = p_business_id;
end;
$$;

revoke all on function public.update_booking_rules(uuid, integer, integer, integer) from public, anon;
grant execute on function public.update_booking_rules(uuid, integer, integer, integer) to authenticated;
