// Intervalo de horas por negocio (horas enteras por defecto) y rubros fuera de belleza.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let tuesday;
let owner;
let staffUser;

const slots = (tx) => tx.query(
  "select slot_time from public.available_slots('barber-studio', $1, $2::date, $3)",
  [IDS.barberCut, tuesday, IDS.barberCarlos],
).then((r) => r.rows.map((x) => x.slot_time));

before(async () => {
  db = await freshDb();
  tuesday = await nextWeekday(db, 2);
  owner = await createUser(db);
  staffUser = await createUser(db);
  await addMember(db, IDS.barber, owner, "owner");
  await addMember(db, IDS.barber, staffUser, "staff", IDS.barberCarlos);
});

describe("intervalo de horas", () => {
  test("los negocios nuevos ofrecen horas enteras", async () => {
    await commitAs(db, "authenticated", owner, async (tx) => {
      const { rows } = await tx.query("select * from public.create_business_with_owner('Taller Don José', 'taller-don-jose', 'automotriz')");
      const { rows: b } = await tx.query("select slot_interval_min from public.businesses where id = $1", [rows[0].business_id]);
      assert.equal(b[0].slot_interval_min, 60);
    });
  });

  test("con 60 min solo aparecen horas en punto; con 30 min, también las medias", async () => {
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.update_slot_interval($1, 60)", [IDS.barber]));
    const hourly = await as(db, "anon", null, slots);
    assert.ok(hourly.length > 0);
    assert.ok(hourly.every((t) => t.endsWith(":00")), hourly.join(", "));

    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.update_slot_interval($1, 30)", [IDS.barber]));
    const half = await as(db, "anon", null, slots);
    assert.ok(half.some((t) => t.endsWith(":30")));
    assert.ok(half.every((t) => t.endsWith(":00") || t.endsWith(":30")), half.join(", "));
  });

  test("una hora fuera de la grilla se rechaza al confirmar", async () => {
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.update_slot_interval($1, 60)", [IDS.barber]));
    await assert.rejects(
      as(db, "service_role", null, (tx) => tx.query(
        "select * from public.create_public_booking('barber-studio', $1, $2, $3::date, '10:30', 'Cliente', '+56 9 1234 5678')",
        [IDS.barberCut, IDS.barberCarlos, tuesday],
      )),
      /SLOT_UNAVAILABLE/,
    );
  });

  test("solo owner/admin lo cambian y solo a 15, 30 o 60", async () => {
    await assert.rejects(
      as(db, "authenticated", owner, (tx) => tx.query("select public.update_slot_interval($1, 45)", [IDS.barber])),
      /INVALID_RULES/,
    );
    await assert.rejects(
      as(db, "authenticated", staffUser, (tx) => tx.query("select public.update_slot_interval($1, 30)", [IDS.barber])),
      /FORBIDDEN/,
    );
  });
});

describe("rubros", () => {
  test("acepta los rubros nuevos y rechaza uno desconocido", async () => {
    await as(db, "authenticated", owner, (tx) =>
      tx.query("select public.update_business_profile($1, 'Barber Studio', 'veterinaria', '', '', '', '')", [IDS.barber]));
    await assert.rejects(
      as(db, "authenticated", owner, (tx) =>
        tx.query("select public.update_business_profile($1, 'Barber Studio', 'astronautas', '', '', '', '')", [IDS.barber])),
      /INVALID_CATEGORY/,
    );
  });
});
