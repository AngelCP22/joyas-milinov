/**
 * Matriz de permisos y contratos de la base del inventario, ejecutada sobre
 * las migraciones REALES de supabase/migrations/ + supabase/seed.sql en
 * Postgres embebido (PGlite). Cubre las secciones 7, 8, 9 y 11 del handoff:
 * constraints, triggers, RLS de products/admin_users, Storage y Realtime.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabaseSim, withRole, expectError } = require("./helpers/supabase-sim.js");

const ADMIN = "11111111-1111-1111-1111-111111111111";
const NO_ADMIN = "22222222-2222-2222-2222-222222222222";
const ADMIN_2 = "33333333-3333-3333-3333-333333333333";

const FOTO = "products/0a1b2c3d-0000-4000-8000-abcdefabcdef.webp";

let db;
let draftId;

/** Producto válido de laboratorio (activo, completo). */
function producto(extra = {}) {
  const base = {
    sku: `MIL-TST-${Math.random().toString(16).slice(2, 8)}`,
    gender: "Mujer",
    name: "Joya de prueba",
    category: "Collares",
    material: "Plata 950",
    model: "Prueba",
    price: 100,
    stock: 5,
    status: "active",
    image: "assets/products/collar-mini-amor.jpg",
    images: JSON.stringify(["assets/products/collar-mini-amor.jpg"])
  };
  return { ...base, ...extra };
}

async function insertProducto(p) {
  const res = await db.query(
    `insert into public.products (sku, gender, name, category, material, model, price, stock, status, image, images)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) returning *`,
    [p.sku, p.gender, p.name, p.category, p.material, p.model, p.price, p.stock, p.status, p.image, p.images]
  );
  return res.rows[0];
}

test.before(async () => {
  db = await createSupabaseSim();
  // Cuentas de laboratorio: una administradora autorizada, una cuenta normal
  // y una segunda administradora (para probar el aislamiento de admin_users).
  await db.query(
    "insert into auth.users (id, email) values ($1,'duena@milinov.test'), ($2,'cliente@milinov.test'), ($3,'socia@milinov.test')",
    [ADMIN, NO_ADMIN, ADMIN_2]
  );
  await db.query("insert into public.admin_users (user_id) values ($1), ($2)", [ADMIN, ADMIN_2]);
  // Un borrador sembrado como superusuario para las pruebas de visibilidad.
  const draft = await insertProducto(producto({ sku: "MIL-DRAFT-001", status: "draft", stock: 0, image: null, images: "[]", category: null, model: null }));
  draftId = draft.id;
});

test.after(async () => {
  if (db) await db.close();
});

/* ============================================================
   Seed y migraciones
   ============================================================ */

test("las migraciones aplican y el seed carga el catálogo completo", async () => {
  const res = await db.query("select count(*)::int as n from public.products where id <= 18");
  assert.equal(res.rows[0].n, 18);
});

test("el seed es idempotente (re-ejecutar no duplica ni falla)", async () => {
  const { readFile } = require("node:fs/promises");
  const path = require("node:path");
  const seed = await readFile(path.join(__dirname, "..", "..", "supabase", "seed.sql"), "utf8");
  const antes = (await db.query("select count(*)::int as n from public.products")).rows[0].n;
  await db.exec(seed);
  const despues = (await db.query("select count(*)::int as n from public.products")).rows[0].n;
  assert.equal(antes, despues);
});

/* ============================================================
   Matriz: visitante anónimo (anon)
   ============================================================ */

test("anon: lee solo productos active/sold_out; los borradores no existen para él", async () => {
  await withRole(db, "anon", null, async () => {
    const visibles = await db.query("select distinct status from public.products");
    const estados = visibles.rows.map(r => r.status).sort();
    assert.deepEqual(estados.filter(s => s === "draft"), []);
    const porId = await db.query("select id from public.products where id = $1", [draftId]);
    assert.equal(porId.rows.length, 0);
  });
});

test("anon: no puede insertar, actualizar ni borrar productos (sin grant)", async () => {
  await withRole(db, "anon", null, async () => {
    await expectError(() => insertProducto(producto()), /permission denied/i);
    await expectError(() => db.query("update public.products set price = 1 where id = 1"), /permission denied/i);
    await expectError(() => db.query("delete from public.products where id = 1"), /permission denied/i);
  });
});

test("anon: no puede leer la lista de administradoras", async () => {
  await withRole(db, "anon", null, async () => {
    await expectError(() => db.query("select * from public.admin_users"), /permission denied/i);
  });
});

/* ============================================================
   Matriz: usuario autenticado NO autorizado
   ============================================================ */

test("no-admin: iniciar sesión no da permisos (no ve borradores)", async () => {
  await withRole(db, "authenticated", NO_ADMIN, async () => {
    const porId = await db.query("select id from public.products where id = $1", [draftId]);
    assert.equal(porId.rows.length, 0);
  });
});

test("no-admin: INSERT rechazado por RLS", async () => {
  await withRole(db, "authenticated", NO_ADMIN, async () => {
    await expectError(() => insertProducto(producto()), /row-level security/i);
  });
});

test("no-admin: UPDATE y DELETE no afectan ninguna fila (RLS filtra)", async () => {
  await withRole(db, "authenticated", NO_ADMIN, async () => {
    const upd = await db.query("update public.products set price = 1 where id = 1 returning id");
    assert.equal(upd.rows.length, 0);
    const del = await db.query("delete from public.products where id = 1 returning id");
    assert.equal(del.rows.length, 0);
  });
  const precio = await db.query("select price from public.products where id = 1");
  assert.notEqual(Number(precio.rows[0].price), 1);
});

test("no-admin: no ve filas ajenas de admin_users ni puede autoagregarse", async () => {
  await withRole(db, "authenticated", NO_ADMIN, async () => {
    const filas = await db.query("select * from public.admin_users");
    assert.equal(filas.rows.length, 0);
    await expectError(
      () => db.query("insert into public.admin_users (user_id) values ($1)", [NO_ADMIN]),
      /permission denied/i
    );
  });
});

/* ============================================================
   Matriz: administradora autorizada
   ============================================================ */

test("admin: ve borradores y el catálogo completo", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    const porId = await db.query("select id, status from public.products where id = $1", [draftId]);
    assert.equal(porId.rows.length, 1);
    assert.equal(porId.rows[0].status, "draft");
  });
});

test("admin: CRUD completo con trigger de versión y updated_at", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    const creado = await insertProducto(producto({ sku: "  MIL-TRIM-001  " }));
    assert.equal(creado.sku, "MIL-TRIM-001", "el trigger normaliza el SKU con btrim");
    assert.equal(creado.version, 1);

    const upd = await db.query(
      "update public.products set price = 222 where id = $1 returning version, updated_at, created_at",
      [creado.id]
    );
    assert.equal(upd.rows[0].version, 2, "cada UPDATE incrementa la versión");
    assert.ok(new Date(upd.rows[0].updated_at) >= new Date(creado.updated_at), "updated_at avanza");

    const del = await db.query("delete from public.products where id = $1 returning id", [creado.id]);
    assert.equal(del.rows.length, 1);
  });
});

test("admin: concurrencia optimista — versión vieja no pisa cambios (D1)", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    const p = await insertProducto(producto());
    // Sesión A y B leen versión 1. A guarda primero:
    const a = await db.query(
      "update public.products set price = 150 where id = $1 and version = $2 returning version",
      [p.id, 1]
    );
    assert.equal(a.rows.length, 1);
    // B intenta guardar con la versión que leyó (1): conflicto = 0 filas.
    const b = await db.query(
      "update public.products set price = 90 where id = $1 and version = $2 returning version",
      [p.id, 1]
    );
    assert.equal(b.rows.length, 0, "el guardado tardío no sobrescribe en silencio");
    const final = await db.query("select price from public.products where id = $1", [p.id]);
    assert.equal(Number(final.rows[0].price), 150);
  });
});

test("admin: solo ve SU fila en admin_users (aunque existan otras)", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    const filas = await db.query("select user_id from public.admin_users");
    assert.equal(filas.rows.length, 1);
    assert.equal(filas.rows[0].user_id, ADMIN);
  });
});

test("revocación: borrar la fila de admin_users corta el acceso en la siguiente petición", async () => {
  await db.query("insert into auth.users (id, email) values ($1, 'temporal@milinov.test')", ["44444444-4444-4444-4444-444444444444"]);
  await db.query("insert into public.admin_users (user_id) values ($1)", ["44444444-4444-4444-4444-444444444444"]);
  await withRole(db, "authenticated", "44444444-4444-4444-4444-444444444444", async () => {
    const ok = await db.query("update public.products set stock = stock where id = 1 returning id");
    assert.equal(ok.rows.length, 1);
  });
  await db.query("delete from public.admin_users where user_id = $1", ["44444444-4444-4444-4444-444444444444"]);
  await withRole(db, "authenticated", "44444444-4444-4444-4444-444444444444", async () => {
    const bloqueado = await db.query("update public.products set stock = stock where id = 1 returning id");
    assert.equal(bloqueado.rows.length, 0, "sin fila en admin_users no hay escritura, con el JWT aún vigente");
  });
});

/* ============================================================
   Constraints de integridad (sección 7 del handoff)
   ============================================================ */

test("constraints: precio, precio anterior, stock y estado", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    await expectError(() => insertProducto(producto({ price: 0 })), /price/i);
    await expectError(() => insertProducto(producto({ price: -5 })), /price/i);
    // old_price se prueba con SQL directo: insertProducto no incluye esa columna.
    await expectError(
      () => db.query("insert into public.products (sku, gender, name, price, old_price) values ('X1','Mujer','x',100,80)"),
      /products_precio_anterior_mayor/i
    );
    await expectError(
      () => db.query("insert into public.products (sku, gender, name, price, old_price) values ('X1','Mujer','x',100,100)"),
      /products_precio_anterior_mayor/i
    );
    await expectError(() => insertProducto(producto({ stock: -1 })), /stock|check/i);
    await expectError(() => insertProducto(producto({ status: "publicado" })), /status|check/i);
    await expectError(() => insertProducto(producto({ gender: "Unisex" })), /gender|check/i);
  });
});

test("constraints: activo exige stock >= 1; agotado y borrador aceptan 0 (D2)", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    await expectError(() => insertProducto(producto({ stock: 0 })), /products_activo_con_stock/i);
    const agotado = await insertProducto(producto({ sku: "MIL-AGO-001", status: "sold_out", stock: 0 }));
    assert.equal(agotado.status, "sold_out");
    const borrador = await insertProducto(producto({ sku: "MIL-BOR-001", status: "draft", stock: 0, image: null, images: "[]", category: null, model: null }));
    assert.equal(borrador.status, "draft");
  });
});

test("constraints: publicado exige taxonomía completa y al menos una foto (D3/D4)", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    await expectError(() => insertProducto(producto({ image: null, images: "[]" })), /products_publicado_completo/i);
    await expectError(() => insertProducto(producto({ model: " " })), /products_publicado_completo/i);
    await expectError(() => insertProducto(producto({ category: null })), /products_publicado_completo/i);
    await expectError(() => insertProducto(producto({ material: "" })), /products_publicado_completo/i);
  });
});

test("constraints: la portada debe ser la primera foto de la galería (D3)", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    await expectError(
      () => insertProducto(producto({ image: "assets/products/otra.jpg" })),
      /products_portada_coherente/i
    );
    await expectError(
      () => insertProducto(producto({ status: "draft", image: "assets/x.jpg", images: "[]" })),
      /products_portada_coherente/i
    );
    // Portada NULL con galería llena: un CHECK que evalúa a NULL se considera
    // satisfecho, así que esto pasaba hasta añadir `image is not null`.
    await expectError(
      () => insertProducto(producto({ image: null })),
      /products_portada_coherente/i
    );
    await expectError(
      () => db.query("update public.products set image = null where id = 1"),
      /products_portada_coherente/i
    );
  });
});

test("la versión la fija la base: un cliente no puede sembrarla en el INSERT", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    const creado = await db.query(
      `insert into public.products (sku, gender, name, category, material, model, price, stock, status, image, images, version)
       values ('MIL-VER-001','Mujer','Version','Collares','Plata 950','V',100,5,'active','a.jpg','["a.jpg"]'::jsonb, 999)
       returning version`
    );
    assert.equal(creado.rows[0].version, 1);
  });
});

test("constraints: images debe ser arreglo JSON de textos no vacíos", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    await expectError(() => insertProducto(producto({ images: '"no-arreglo"' })), /products_images_arreglo/i);
    await expectError(() => insertProducto(producto({ images: "[1,2]" })), /products_images_arreglo/i);
    await expectError(() => insertProducto(producto({ images: '[" "]' })), /products_images_arreglo/i);
  });
});

test("constraints: SKU obligatorio y único sin distinguir mayúsculas", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    await expectError(() => insertProducto(producto({ sku: "   " })), /products_sku_no_vacio/i);
    await insertProducto(producto({ sku: "MIL-DUP-100" }));
    await expectError(() => insertProducto(producto({ sku: "mil-dup-100" })), /products_sku_unico|duplicate/i);
  });
});

test("importación masiva: un INSERT multi-fila es atómico (una fila mala no deja escrituras parciales)", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    const antes = (await db.query("select count(*)::int as n from public.products")).rows[0].n;
    await expectError(() => db.query(
      `insert into public.products (sku, gender, name, category, material, model, price, stock, status, image, images) values
       ('MIL-CSV-001','Mujer','Ok','Collares','Plata 950','M',100,5,'active','a.jpg','["a.jpg"]'::jsonb),
       ('MIL-CSV-002','Mujer','Mala','Collares','Plata 950','M',0,5,'active','b.jpg','["b.jpg"]'::jsonb)`
    ), /price/i);
    const despues = (await db.query("select count(*)::int as n from public.products")).rows[0].n;
    assert.equal(antes, despues, "ninguna fila del lote inválido quedó insertada");
  });
});

/* ============================================================
   Storage (sección 9 del handoff)
   ============================================================ */

test("storage: el bucket productos queda configurado con límite y tipos permitidos", async () => {
  const b = (await db.query("select * from storage.buckets where id = 'productos'")).rows[0];
  assert.ok(b);
  assert.equal(b.public, true);
  assert.equal(Number(b.file_size_limit), 5242880);
  assert.deepEqual(b.allowed_mime_types, ["image/jpeg", "image/png", "image/webp"]);
});

test("storage: admin sube/actualiza/borra solo bajo products/<uuid>.<ext>", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    const ok = await db.query(
      "insert into storage.objects (bucket_id, name, owner_id) values ('productos', $1, $2) returning id",
      [FOTO, ADMIN]
    );
    assert.equal(ok.rows.length, 1);

    for (const mala of [
      "products/../secreto.webp",
      "products/foto-bonita.webp",
      "otra-carpeta/0a1b2c3d-0000-4000-8000-abcdefabcdef.webp",
      "products/0a1b2c3d-0000-4000-8000-abcdefabcdef.svg",
      "products/0a1b2c3d-0000-4000-8000-abcdefabcdef.webp/extra.webp"
    ]) {
      await expectError(
        () => db.query("insert into storage.objects (bucket_id, name) values ('productos', $1)", [mala]),
        /row-level security/i
      );
    }

    const del = await db.query("delete from storage.objects where bucket_id = 'productos' and name = $1 returning id", [FOTO]);
    assert.equal(del.rows.length, 1);
  });
});

test("storage: nadie salvo las administradoras enumera, sube, reemplaza ni borra fotos", async () => {
  await withRole(db, "authenticated", ADMIN, async () => {
    await db.query("insert into storage.objects (bucket_id, name) values ('productos', $1)", [FOTO]);
  });
  for (const [rol, sub] of [["anon", null], ["authenticated", NO_ADMIN]]) {
    await withRole(db, rol, sub, async () => {
      // Las fotos publicadas se sirven por URL pública del bucket (sin RLS);
      // enumerar el bucket sí está cerrado, para no revelar las de borradores.
      const lee = await db.query("select name from storage.objects where bucket_id = 'productos'");
      assert.equal(lee.rows.length, 0, `${rol} no puede enumerar el bucket`);
      await expectError(
        () => db.query("insert into storage.objects (bucket_id, name) values ('productos', 'products/0a1b2c3d-0000-4000-8000-000000000001.webp')"),
        /row-level security/i
      );
      const upd = await db.query("update storage.objects set name = name where bucket_id = 'productos' returning id");
      assert.equal(upd.rows.length, 0, `${rol} no puede reemplazar fotos`);
      const del = await db.query("delete from storage.objects where bucket_id = 'productos' returning id");
      assert.equal(del.rows.length, 0, `${rol} no puede borrar fotos`);
    });
  }
  // La administradora sí las lista (lo necesita para gestionar la galería).
  await withRole(db, "authenticated", ADMIN, async () => {
    const lee = await db.query("select name from storage.objects where bucket_id = 'productos'");
    assert.ok(lee.rows.length >= 1);
  });
});

/* ============================================================
   Realtime (D7): aviso sin datos, sin publicación postgres_changes
   ============================================================ */

test("realtime: cada cambio de inventario emite UN aviso por sentencia y sin datos de producto", async () => {
  await db.query("delete from realtime.messages");
  await withRole(db, "authenticated", ADMIN, async () => {
    await db.query("update public.products set featured = featured where id in (1,2,3)");
  });
  const msgs = (await db.query("select * from realtime.messages")).rows;
  assert.equal(msgs.length, 1, "trigger por sentencia: un lote = un aviso");
  assert.equal(msgs[0].topic, "catalog");
  assert.equal(msgs[0].extension, "broadcast");
  assert.equal(msgs[0].private, true);
  assert.deepEqual(Object.keys(msgs[0].payload), ["op"], "el payload solo lleva la operación, jamás datos de la joya");
});

test("realtime: anon puede recibir el aviso del topic catalog y nada más", async () => {
  await withRole(db, "anon", null, async () => {
    await db.query("select set_config('realtime.topic', 'catalog', false)");
    const visibles = await db.query("select topic from realtime.messages");
    assert.ok(visibles.rows.length >= 1, "anon recibe el ping del catálogo");
    await db.query("select set_config('realtime.topic', 'otro-topic', false)");
    const otros = await db.query("select topic from realtime.messages");
    assert.equal(otros.rows.length, 0, "fuera del topic autorizado no se lee nada");
    await db.query("select set_config('realtime.topic', '', false)");
    await expectError(
      () => db.query("insert into realtime.messages (topic, extension, event) values ('catalog','broadcast','change')"),
      /permission denied/i
    );
  });
});

test("realtime: no queda ninguna publicación postgres_changes sobre products", async () => {
  const pub = await db.query(
    "select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'products'"
  );
  assert.equal(pub.rows.length, 0, "el diseño D7 retiró postgres_changes por sus fugas de RLS");
});
