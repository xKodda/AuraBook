-- ═════════════════════════════════════════════════════════════
-- Contratar Premium: solicitudes de pago (transferencia hoy; tarjeta cuando haya pasarela)
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. Flujo:
--   1. El dueño elige periodicidad y profesionales adicionales; el MONTO lo calcula la base de datos (premium_quote),
--      nunca el navegador.
--   2. Avisa que transfirió → queda una solicitud «pending». Esto NO activa Premium.
--   3. Clikium revisa la transferencia en /admin y la aprueba → se registra el pago (admin_record_payment), se
--      actualizan los adicionales y la suscripción queda activa. O la rechaza.
-- Con una pasarela (Webpay, Flow o Mercado Pago) el paso 3 lo hará el webhook verificado del proveedor.

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  billing_period text not null check (billing_period in ('monthly', 'yearly')),
  months integer not null check (months in (1, 12)),
  extra_staff integer not null default 0 check (extra_staff between 0 and 100),
  amount_clp integer not null check (amount_clp >= 0),
  method text not null check (method in ('transferencia', 'tarjeta')),
  reference text check (length(reference) <= 120),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  payment_id uuid references public.subscription_payments(id) on delete set null,
  notes text check (length(notes) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
-- Una sola solicitud pendiente por negocio.
create unique index if not exists payment_requests_one_pending on public.payment_requests(business_id) where status = 'pending';
create index if not exists payment_requests_status_idx on public.payment_requests(status, created_at desc);

alter table public.payment_requests enable row level security;
revoke all on table public.payment_requests from anon, authenticated;
grant select on table public.payment_requests to authenticated;
drop policy if exists manager_payment_requests on public.payment_requests;
create policy manager_payment_requests on public.payment_requests for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));

-- Precio de Premium según periodicidad y adicionales (IVA incluido). Los adicionales se cobran por mes.
create or replace function public.premium_quote(p_period text, p_extra integer)
returns integer language sql stable security definer set search_path = '' as $$
  select case when p_period = 'yearly' then p.price_yearly_clp else p.price_clp end
    + coalesce(p_extra, 0) * coalesce(p.extra_staff_price_clp, 0) * case when p_period = 'yearly' then 12 else 1 end
  from public.plans p where p.code = 'premium';
$$;

create or replace function public.create_payment_request(
  p_business_id uuid, p_period text, p_extra integer, p_reference text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_plan public.plans%rowtype;
  v_amount integer;
  v_id uuid;
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_plan from public.plans p where p.code = 'premium' and p.is_active;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_period not in ('monthly', 'yearly') or p_extra is null or p_extra < 0 or p_extra > v_plan.max_extra_staff
    or (p_reference is not null and length(trim(p_reference)) > 120)
  then
    raise exception 'INVALID_PAYMENT_REQUEST' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payment_requests r where r.business_id = p_business_id and r.status = 'pending') then
    raise exception 'PAYMENT_REQUEST_PENDING' using errcode = 'P0001';
  end if;
  v_amount := public.premium_quote(p_period, p_extra);
  insert into public.payment_requests (business_id, plan_id, billing_period, months, extra_staff, amount_clp, method, reference, created_by)
  values (p_business_id, v_plan.id, p_period, case when p_period = 'yearly' then 12 else 1 end, p_extra, v_amount,
    'transferencia', nullif(trim(p_reference), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'amountClp', v_amount);
end;
$$;

create or replace function public.cancel_payment_request(p_business_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.payment_requests set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid()
  where business_id = p_business_id and status = 'pending';
end;
$$;

-- /admin: solicitudes pendientes y las últimas resueltas.
create or replace function public.admin_payment_requests()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'businessId', r.business_id, 'businessName', b.name, 'businessSlug', b.slug,
      'ownerEmail', (select u.email from public.business_members m join auth.users u on u.id = m.user_id
        where m.business_id = r.business_id and m.role = 'owner' order by m.created_at limit 1),
      'billingPeriod', r.billing_period, 'months', r.months, 'extraStaff', r.extra_staff, 'amountClp', r.amount_clp,
      'method', r.method, 'reference', coalesce(r.reference, ''), 'status', r.status,
      'createdAt', r.created_at, 'resolvedAt', r.resolved_at
    ) order by (r.status = 'pending') desc, r.created_at desc)
    from (select * from public.payment_requests order by created_at desc limit 50) r
    join public.businesses b on b.id = r.business_id
  ), '[]'::jsonb);
end;
$$;

-- /admin: aprobar registra el pago con el monto calculado al pedirlo y activa los adicionales; rechazar no cambia nada.
create or replace function public.admin_resolve_payment_request(p_request_id uuid, p_approve boolean, p_notes text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_req public.payment_requests%rowtype;
  v_payment uuid;
begin
  perform public.assert_platform_admin();
  select * into v_req from public.payment_requests r where r.id = p_request_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'PAYMENT_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_approve then
    v_payment := public.admin_record_payment(
      v_req.business_id, v_req.plan_id, v_req.amount_clp, v_req.months,
      (now() at time zone 'America/Santiago')::date, v_req.method, v_req.reference,
      left(concat_ws(' · ', 'Solicitud desde «Mi plan»', nullif(trim(p_notes), '')), 500));
    update public.subscriptions set extra_staff = v_req.extra_staff where business_id = v_req.business_id;
  end if;
  update public.payment_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    payment_id = v_payment, notes = nullif(trim(p_notes), ''), resolved_at = now(), resolved_by = auth.uid()
  where id = p_request_id;
end;
$$;

revoke all on function public.premium_quote(text, integer) from public;
grant execute on function public.premium_quote(text, integer) to anon, authenticated;
revoke all on function public.create_payment_request(uuid, text, integer, text) from public, anon;
grant execute on function public.create_payment_request(uuid, text, integer, text) to authenticated;
revoke all on function public.cancel_payment_request(uuid) from public, anon;
grant execute on function public.cancel_payment_request(uuid) to authenticated;
revoke all on function public.admin_payment_requests() from public, anon;
grant execute on function public.admin_payment_requests() to authenticated;
revoke all on function public.admin_resolve_payment_request(uuid, boolean, text) from public, anon;
grant execute on function public.admin_resolve_payment_request(uuid, boolean, text) to authenticated;
