-- ═════════════════════════════════════════════════════════════
-- Endurecimiento de entradas: nombre del cliente en las reservas
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. Misma regla que lib/validation.ts (personNameSchema), también en la base de datos para que
-- valga aunque alguien llame a las funciones sin pasar por la app: el nombre no lleva caracteres de control, HTML
-- (< >) ni enlaces. Evita usar una reserva para enviar spam o phishing en los avisos que recibe el negocio.
-- Es un trigger (no un CHECK) para exigirlo solo al crear la reserva o cambiar el nombre: las reservas existentes
-- no se revisan y se pueden seguir cancelando o completando.

create or replace function public.bookings_check_client_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.client_name ~ '[<>[:cntrl:]]' or new.client_name ~* '(https?:|www\.)' then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.bookings_check_client_name() from public, anon, authenticated;

drop trigger if exists bookings_client_name_safe on public.bookings;
create trigger bookings_client_name_safe before insert or update of client_name on public.bookings
  for each row execute function public.bookings_check_client_name();
