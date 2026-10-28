// Planes Free y Premium (migraciones 20261102000000 y 20261107000000): capacidades efectivas, límites aplicados en
// la base de datos, prueba al publicar, historial de eventos y vencimientos.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let tuesday;
let barberOwner;
let nailsOwner;

const limits = async (businessId) => (await db.query(
  "select tier, status, max_staff, max_services, max_monthly_bookings, features from public.business_limits($1)", [businessId])).rows[0];
const setSubscription = (sql) => db.query(`update public.subscriptions set ${sql} where business_id = $1`, [IDS.barber]);
const bookable = async () => (await db.query("select s::text id from public.business_bookable_staff($1) s", [IDS.barber])).rows.map((r) => r.id);
const manual = (tx, time) => tx.query(
  `select * from public.panel_create_booking($1, $2, $3, 'Cliente', '+56 9 1111 2222', ('${tuesday}'::date + time '${time}') at time zone 'America/Santiago')`,
  [IDS.barber, IDS.barberCut, IDS.barberCarlos]);

before(async () => {
  db = await freshDb();
  tuesday = await nextWeekday(db, 2);
  barberOwner = await createUser(db);
  nailsOwner = await createUser(db);
  await addMember(db, IDS.barber, barberOwner, "owner");
  await addMember(db, IDS.nails, nailsOwner, "owner");
});

describe("planes publicados", () => {
  test("Free y Premium con sus límites, precios con IVA y 30 días de prueba", async () => {
    const data = await as(db, "anon", null, async (tx) => (await tx.query("select public.public_plans() p")).rows[0].p);
    assert.equal(data.trialDays, 30);
    const [free, premium] = data.plans;
    assert.deepEqual([free.code, free.priceClp, free.maxStaff, free.maxServices, free.maxMonthlyBookings, free.features], ["free", 0, 2, 8, 100, ["client_reminders"]]);
    assert.deepEqual(
      [premium.code, premium.priceClp, premium.priceYearlyClp, premium.maxStaff, premium.extraStaffPriceClp, premium.maxExtraStaff,
        premium.maxServices, premium.maxMonthlyBookings, premium.promoPriceClp],
      ["premium", 12990, 129900, 3, 2990, 5, null, null, null]);
    assert.deepEqual(premium.features, ["client_reminders", "revenue_stats", "custom_branding", "hide_branding", "no_show_control"]);
  });
});

describe("capacidades efectivas", () => {
  test("en prueba, el negocio tiene Premium sin límites de servicios ni reservas", async () => {
    assert.deepEqual(await limits(IDS.barber), {
      tier: "premium", status: "trial", max_staff: 3, max_services: null, max_monthly_bookings: null,
      features: ["client_reminders", "revenue_stats", "custom_branding", "hide_branding", "no_show_control"],
    });
  });

  test("el panel ve plan, uso y fechas de sus negocios", async () => {
    const rows = await as(db, "authenticated", barberOwner, async (tx) => (await tx.query("select * from public.my_entitlements()")).rows);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tier, "premium");
    assert.equal(rows[0].staff_count, 2);
    assert.equal(rows[0].services_count, 3);
    assert.equal(rows[0].bookings_this_month, 0);
    assert.ok(rows[0].trial_ends_at);
  });

  test("Premium pagado suma los profesionales adicionales, con tope", async () => {
    await setSubscription(`plan_id = (select id from public.plans where code = 'premium'), paid_until = now() + interval '10 days', extra_staff = 2`);
    assert.equal((await limits(IDS.barber)).max_staff, 5);
    await setSubscription("extra_staff = 9");
    assert.equal((await limits(IDS.barber)).max_staff, 8, "3 incluidos + 5 adicionales como máximo");
    await setSubscription("plan_id = null, paid_until = null, extra_staff = 0");
  });

  test("un pago vigente en un plan anterior cuenta como Premium con su propio límite", async () => {
    const { rows } = await db.query("insert into public.plans (name, price_clp, max_staff, is_active) values ('Equipo', 19990, 5, false) returning id");
    await setSubscription(`plan_id = '${rows[0].id}', paid_until = now() + interval '10 days'`);
    const l = await limits(IDS.barber);
    assert.equal(l.tier, "premium");
    assert.equal(l.max_staff, 5);
    assert.ok(l.features.includes("custom_branding"));
    await setSubscription("plan_id = null, paid_until = null");
  });
});

describe("al vencer la prueba pasa a Free", () => {
  before(async () => {
    await setSubscription("trial_ends_at = now() - interval '1 day'");
  });

  test("las capacidades son las de Free", async () => {
    assert.deepEqual(await limits(IDS.barber), {
      tier: "free", status: "past_due", max_staff: 2, max_services: 8, max_monthly_bookings: 100, features: ["client_reminders"],
    });
  });

  test("con 3 profesionales, la página pública solo ofrece a los 2 primeros y no se pueden agregar más", async () => {
    await db.query("insert into public.staff (business_id, name, sort_order) values ($1, 'Tercero', 99)", [IDS.barber]);
    assert.deepEqual((await bookable()).sort(), [IDS.barberCarlos, IDS.barberMatias].sort());
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => tx.query("select public.save_staff($1, null, 'Cuarto')", [IDS.barber])),
      /PLAN_STAFF_LIMIT/);
  });

  test("hasta 8 servicios: el noveno se rechaza (los existentes se conservan)", async () => {
    await assert.rejects(as(db, "authenticated", barberOwner, async (tx) => {
      for (let i = 4; i <= 9; i++) {
        await tx.query("select public.save_service($1, null, $2, '', 10000, 30, array[$3]::uuid[])", [IDS.barber, `Servicio ${i}`, IDS.barberCarlos]);
      }
    }), /PLAN_SERVICE_LIMIT/);
  });

  test("cuota mensual por mes de atención: cancelar libera el cupo y otros meses siguen disponibles", async () => {
    const day = `${tuesday}`;
    const used = (await db.query("select public.business_active_bookings_in_month($1, $2::date) n", [IDS.barber, day])).rows[0].n;
    await db.query("update public.plans set max_monthly_bookings = $1 where code = 'free'", [used + 1]);
    await assert.rejects(as(db, "authenticated", barberOwner, async (tx) => {
      await manual(tx, "12:00");
      await manual(tx, "13:00");
    }), /MONTHLY_LIMIT_REACHED/);
    const created = await commitAs(db, "authenticated", barberOwner, async (tx) => (await manual(tx, "12:00")).rows[0].booking_id);
    const full = await as(db, "anon", null, async (tx) => (await tx.query("select public.public_month_full('barber-studio', $1::date) f", [day])).rows[0].f);
    assert.equal(full, true);
    const nextMonth = await as(db, "anon", null, async (tx) =>
      (await tx.query("select public.public_month_full('barber-studio', ($1::date + interval '1 month')::date) f", [day])).rows[0].f);
    assert.equal(nextMonth, false, "el mes siguiente sigue disponible");
    const slots = await as(db, "anon", null, async (tx) =>
      (await tx.query("select count(*)::int n from public.available_slots('barber-studio', $1, $2::date)", [IDS.barberCut, day])).rows[0].n);
    assert.equal(slots, 0, "con el mes completo no se ofrecen horas");
    // Cancelar libera el cupo; reactivarla lo vuelve a ocupar (y se valida).
    await db.query("update public.bookings set status = 'cancelled' where id = $1", [created]);
    assert.equal((await db.query("select public.business_active_bookings_in_month($1, $2::date) n", [IDS.barber, day])).rows[0].n, used);
    await commitAs(db, "authenticated", barberOwner, (tx) => manual(tx, "13:00"));
    await assert.rejects(db.query("update public.bookings set status = 'confirmed' where id = $1", [created]), /MONTHLY_LIMIT_REACHED/);
    await db.query("update public.plans set max_monthly_bookings = 100 where code = 'free'");
  });

  test("logo propio en Free; color y ocultar la marca requieren Premium", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => tx.query("select public.set_business_brand_color($1, '#123456')", [IDS.barber])),
      /PLAN_FEATURE_REQUIRED/);
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => tx.query("select public.set_business_hide_branding($1, true)", [IDS.barber])),
      /PLAN_FEATURE_REQUIRED/);
    await as(db, "authenticated", barberOwner, (tx) => tx.query("select public.set_business_logo($1, null)", [IDS.barber]));
  });

  test("ingresos requieren Premium; el recordatorio al cliente está en Free", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => tx.query("select * from public.panel_revenue($1, $2::date, $2::date)", [IDS.barber, tuesday])),
      /PLAN_FEATURE_REQUIRED/);
    const { rows } = await db.query("select public.business_has_feature($1, 'client_reminders') ok", [IDS.barber]);
    assert.equal(rows[0].ok, true);
  });

  test("el vencimiento queda registrado una sola vez, sin que nadie abra la app", async () => {
    const first = (await db.query("select public.record_subscription_expirations() n")).rows[0].n;
    const second = (await db.query("select public.record_subscription_expirations() n")).rows[0].n;
    assert.ok(first >= 1);
    assert.equal(second, 0);
    const { rows } = await db.query("select type from public.subscription_events where business_id = $1 and type = 'trial_expired'", [IDS.barber]);
    assert.equal(rows.length, 1);
  });

  test("al pagar Premium (anual) vuelve todo y queda el historial", async () => {
    await db.query(`insert into public.subscription_payments (business_id, plan_id, amount_clp, paid_at, months, period_start, period_end, method)
      values ($1, (select id from public.plans where code = 'premium'), 129900, current_date, 12, now(), now() + interval '12 months', 'transferencia')`, [IDS.barber]);
    await setSubscription(`plan_id = (select id from public.plans where code = 'premium'), paid_until = now() + interval '12 months'`);
    assert.equal((await limits(IDS.barber)).tier, "premium");
    assert.equal((await bookable()).length, 3);
    const sub = await db.query("select billing_period from public.subscriptions where business_id = $1", [IDS.barber]);
    assert.equal(sub.rows[0].billing_period, "yearly");
    const types = await as(db, "authenticated", barberOwner, async (tx) =>
      (await tx.query("select type from public.subscription_events where business_id = $1", [IDS.barber])).rows.map((r) => r.type));
    assert.ok(types.includes("payment_recorded") && types.includes("plan_changed"));
    const foreign = await as(db, "authenticated", nailsOwner, async (tx) =>
      (await tx.query("select count(*)::int n from public.subscription_events where business_id = $1", [IDS.barber])).rows[0].n);
    assert.equal(foreign, 0, "otro negocio no ve el historial");
  });

  test("un usuario no puede escribir su suscripción ni su historial", async () => {
    await assert.rejects(as(db, "authenticated", barberOwner, (tx) =>
      tx.query("update public.subscriptions set paid_until = now() + interval '10 years' where business_id = $1", [IDS.barber])), /permission denied/);
    await assert.rejects(as(db, "authenticated", barberOwner, (tx) =>
      tx.query("insert into public.subscription_events (business_id, type) values ($1, 'reactivated')", [IDS.barber])), /permission denied/);
  });
});

describe("prueba al publicar", () => {
  test("empieza al terminar el onboarding, dura 30 días y es una sola por negocio", async () => {
    const { rows } = await db.query(
      "insert into public.businesses (slug, name, is_active) values ('nuevo-local', 'Nuevo Local', false) returning id");
    const id = rows[0].id;
    const sub = async () => (await db.query(
      "select trial_started_at, round(extract(epoch from trial_ends_at - now()) / 86400) days from public.subscriptions where business_id = $1", [id])).rows[0];
    assert.equal((await sub()).trial_started_at, null);

    await db.query("update public.businesses set onboarding_completed_at = now(), is_active = true where id = $1", [id]);
    const started = await sub();
    assert.ok(started.trial_started_at);
    assert.equal(Number(started.days), 30);

    await db.query("update public.subscriptions set trial_ends_at = now() - interval '1 day' where business_id = $1", [id]);
    await db.query("update public.businesses set onboarding_completed_at = null where id = $1", [id]);
    await db.query("update public.businesses set onboarding_completed_at = now() where id = $1", [id]);
    assert.ok(Number((await sub()).days) < 0, "no se otorga una segunda prueba");
    const events = await db.query("select count(*)::int n from public.subscription_events where business_id = $1 and type = 'trial_started'", [id]);
    assert.equal(events.rows[0].n, 1);
  });
});
