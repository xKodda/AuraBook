// Marca del negocio: logo (URL dentro de la carpeta del propio negocio) y color.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, createUser, freshDb } from "./supabase-harness.mjs";

let db;
let owner;
let staffUser;
let outsider;

const logo = (businessId, file = "logo-1.webp") =>
  `https://abc.supabase.co/storage/v1/object/public/business-logos/${businessId}/${file}`;

before(async () => {
  db = await freshDb();
  owner = await createUser(db);
  staffUser = await createUser(db);
  outsider = await createUser(db);
  await addMember(db, IDS.barber, owner, "owner");
  await addMember(db, IDS.barber, staffUser, "staff", IDS.barberCarlos);
  await addMember(db, IDS.nails, outsider, "owner");
});

describe("logo del negocio", () => {
  test("el owner guarda un logo de la carpeta de su negocio y lo puede quitar", async () => {
    await as(db, "authenticated", owner, async (tx) => {
      await tx.query("select public.set_business_logo($1, $2)", [IDS.barber, logo(IDS.barber)]);
      let { rows } = await tx.query("select logo_url from public.businesses where id = $1", [IDS.barber]);
      assert.equal(rows[0].logo_url, logo(IDS.barber));
      await tx.query("select public.set_business_logo($1, null)", [IDS.barber]);
      ({ rows } = await tx.query("select logo_url from public.businesses where id = $1", [IDS.barber]));
      assert.equal(rows[0].logo_url, null);
    });
  });

  test("rechaza URLs externas o de la carpeta de otro negocio", async () => {
    for (const url of [
      "https://evil.cl/logo.png",
      logo(IDS.nails),
      logo(IDS.barber, "../x.png"),
      logo(IDS.barber, "logo.svg"),
    ]) {
      await assert.rejects(
        as(db, "authenticated", owner, (tx) => tx.query("select public.set_business_logo($1, $2)", [IDS.barber, url])),
        /INVALID_LOGO/,
        url,
      );
    }
  });

  test("un profesional o el dueño de otro negocio no pueden cambiarlo", async () => {
    for (const user of [staffUser, outsider]) {
      await assert.rejects(
        as(db, "authenticated", user, (tx) => tx.query("select public.set_business_logo($1, $2)", [IDS.barber, logo(IDS.barber)])),
        /FORBIDDEN/,
      );
    }
    await assert.rejects(
      as(db, "anon", null, (tx) => tx.query("select public.set_business_logo($1, null)", [IDS.barber])),
      /permission denied/,
    );
  });
});

describe("color de marca", () => {
  test("el owner cambia el color; se valida el formato", async () => {
    await as(db, "authenticated", owner, async (tx) => {
      await tx.query("select public.set_business_brand_color($1, '#5a6b4e')", [IDS.barber]);
      const { rows } = await tx.query("select brand_color from public.businesses where id = $1", [IDS.barber]);
      assert.equal(rows[0].brand_color, "#5A6B4E");
    });
    await assert.rejects(
      as(db, "authenticated", owner, (tx) => tx.query("select public.set_business_brand_color($1, 'red')", [IDS.barber])),
      /INVALID_COLOR/,
    );
    await assert.rejects(
      as(db, "authenticated", outsider, (tx) => tx.query("select public.set_business_brand_color($1, '#000000')", [IDS.barber])),
      /FORBIDDEN/,
    );
  });
});

describe("reglas de reserva", () => {
  test("owner y admin las cambian; se validan los rangos", async () => {
    const admin = await createUser(db);
    await addMember(db, IDS.barber, admin, "admin");
    for (const user of [owner, admin]) {
      await as(db, "authenticated", user, async (tx) => {
        await tx.query("select public.update_booking_rules($1, 60, 45, 240)", [IDS.barber]);
        const { rows } = await tx.query("select min_notice_min, max_days_ahead, cancel_notice_min from public.businesses where id = $1", [IDS.barber]);
        assert.deepEqual(rows[0], { min_notice_min: 60, max_days_ahead: 45, cancel_notice_min: 240 });
      });
    }
    await assert.rejects(
      as(db, "authenticated", owner, (tx) => tx.query("select public.update_booking_rules($1, 60, 500, 240)", [IDS.barber])),
      /INVALID_RULES/,
    );
    for (const user of [staffUser, outsider]) {
      await assert.rejects(
        as(db, "authenticated", user, (tx) => tx.query("select public.update_booking_rules($1, 60, 30, 120)", [IDS.barber])),
        /FORBIDDEN/,
      );
    }
  });
});

describe("aceptación de documentos legales", () => {
  test("cada usuario ve solo sus aceptaciones y no puede escribirlas", async () => {
    await db.query("insert into public.legal_acceptances (user_id, document, version) values ($1, 'terminos', '1.0'), ($2, 'terminos', '1.0')", [owner, outsider]);
    const { rows } = await as(db, "authenticated", owner, (tx) => tx.query("select user_id from public.legal_acceptances"));
    assert.deepEqual(rows.map((r) => r.user_id), [owner]);
    await assert.rejects(
      as(db, "authenticated", owner, (tx) => tx.query("insert into public.legal_acceptances (user_id, document, version) values ($1, 'privacidad', '1.0')", [owner])),
      /permission denied/,
    );
    await assert.rejects(as(db, "anon", null, (tx) => tx.query("select * from public.legal_acceptances")), /permission denied/);
  });
});
