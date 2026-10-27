-- ═════════════════════════════════════════════════════════════
-- Precio de lanzamiento de Premium: $12.990 al mes durante los primeros 6 meses; luego $15.990 (IVA incluido).
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. Para terminar la promoción: update public.plans set promo_price_clp = null,
-- promo_months = null where code = 'premium';
-- Los pagos se siguen registrando a mano en /admin: durante los primeros 6 meses de cada suscriptor se registra el
-- monto promocional.
alter table public.plans add column if not exists promo_price_clp integer check (promo_price_clp between 0 and 10000000);
alter table public.plans add column if not exists promo_months integer check (promo_months between 1 and 24);

update public.plans set promo_price_clp = 12990, promo_months = 6
where code = 'premium' and promo_price_clp is null;

-- /precios y «Mi plan» muestran la promoción vigente.
create or replace function public.public_plans()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trialDays', (select s.trial_days from public.platform_settings s),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
      'code', p.code, 'name', p.name, 'description', coalesce(p.description, ''),
      'priceClp', p.price_clp, 'priceYearlyClp', p.price_yearly_clp, 'maxStaff', p.max_staff, 'features', to_jsonb(p.features),
      'promoPriceClp', p.promo_price_clp, 'promoMonths', p.promo_months
    ) order by p.sort_order, p.price_clp) from public.plans p where p.is_active and p.code is not null), '[]'::jsonb)
  );
$$;

revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated;
