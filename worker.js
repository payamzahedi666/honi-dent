// Honi Dent Worker: JSON API on D1, static app from ./public.
// Setup: bindings -> D1 database named DB; secret APP_PASSWORD.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function loadAll(db) {
  const [doctors, orders, prices, notes] = await Promise.all([
    db.prepare("SELECT id, name FROM doctors ORDER BY name").all(),
    db.prepare("SELECT * FROM orders ORDER BY date, id").all(),
    db.prepare("SELECT work_type, amount FROM prices").all(),
    db.prepare("SELECT * FROM notes ORDER BY date, id").all(),
  ]);
  return {
    doctors: doctors.results,
    orders: orders.results.map((o) => ({
      id: o.id, doctorId: o.doctor_id, patient: o.patient, date: o.date, due: o.due,
      types: JSON.parse(o.types), color: o.color, template: o.template, units: o.units, desc: o.description,
    })),
    prices: Object.fromEntries(prices.results.map((p) => [p.work_type, p.amount])),
    notes: notes.results.map((n) => ({ id: n.id, doctorId: n.doctor_id, patient: n.patient, text: n.text, date: n.date })),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (!env.APP_PASSWORD || request.headers.get("authorization") !== `Bearer ${env.APP_PASSWORD}`) {
      return json({ error: "unauthorized" }, 401);
    }

    const db = env.DB;
    const p = url.pathname;
    const m = request.method;
    try {
      if (p === "/api/all" && m === "GET") return json(await loadAll(db));

      if (p === "/api/doctors" && m === "POST") {
        const b = await request.json();
        await db.prepare("INSERT OR IGNORE INTO doctors (id, name) VALUES (?, ?)").bind(b.id, b.name).run();
        return json({ ok: true });
      }

      if (p === "/api/orders" && m === "POST") {
        const o = await request.json();
        await db.prepare(
          "INSERT OR IGNORE INTO orders (id, doctor_id, patient, date, due, types, color, template, units, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(o.id, o.doctorId, o.patient, o.date, o.due, JSON.stringify(o.types), o.color, o.template, o.units, o.desc || "").run();
        return json({ ok: true });
      }

      if (p === "/api/notes" && m === "POST") {
        const n = await request.json();
        await db.prepare("INSERT OR IGNORE INTO notes (id, doctor_id, patient, text, date) VALUES (?, ?, ?, ?, ?)")
          .bind(n.id, n.doctorId, n.patient, n.text, n.date).run();
        return json({ ok: true });
      }

      if (p.startsWith("/api/prices/") && m === "PUT") {
        const type = decodeURIComponent(p.slice("/api/prices/".length));
        const b = await request.json();
        await db.prepare(
          "INSERT INTO prices (work_type, amount) VALUES (?, ?) ON CONFLICT(work_type) DO UPDATE SET amount = excluded.amount"
        ).bind(type, Number(b.amount) || 0).run();
        return json({ ok: true });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};
