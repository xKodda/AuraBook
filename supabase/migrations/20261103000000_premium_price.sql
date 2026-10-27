-- ═════════════════════════════════════════════════════════════
-- Precio de lanzamiento de Premium: $15.990 al mes o $159.900 al año (2 meses gratis), IVA incluido.
-- ═════════════════════════════════════════════════════════════
-- Solo cambia el plan Premium si sigue con el precio inicial (no pisa un precio editado desde /admin).
-- Los pagos ya registrados conservan su monto. Se puede volver a ejecutar sin efecto.
update public.plans
set price_clp = 15990, price_yearly_clp = 159900
where code = 'premium' and price_clp = 12990;
