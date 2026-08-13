/**
 * supabase-sim.js — Simulador local de Supabase sobre PGlite (Postgres real
 * embebido, sin Docker) para probar las migraciones y políticas RLS de
 * supabase/migrations/ con evidencia ejecutada.
 *
 * Qué simula (lo mínimo que las migraciones tocan):
 *   - roles `anon` y `authenticated` (los usa la Data API real),
 *   - `auth.users` + `auth.uid()` leyendo request.jwt.claims (igual que Supabase),
 *   - esquema `storage` (buckets/objects con RLS y grants como el hosted),
 *   - esquema `realtime` (messages + send() + topic()) capturando los avisos.
 *
 * Qué NO simula: PostgREST, Auth server, el Storage API HTTP ni el websocket
 * de Realtime. La matriz se repite contra el proyecto real en preview antes
 * de activar producción (docs/DEPLOY-ADMIN.md).
 */
const { readFile, readdir } = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..", "..");

const SHIM_SQL = `
-- Roles que usa la Data API real de Supabase.
create role anon nologin;
create role authenticated nologin;

-- Esquema auth: tabla de usuarios y auth.uid() con la misma semántica
-- (lee el claim "sub" de request.jwt.claims).
create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique
);
create function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

-- Esquema storage mínimo. En el hosted los roles tienen grants amplios sobre
-- storage.objects y la seguridad real la dan las políticas RLS: replicamos eso.
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner_id text,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Esquema realtime mínimo: send() inserta en messages (definer, como el real)
-- y topic() lee el topic "actual" del canal simulado.
create schema realtime;
create table realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  extension text not null,
  event text,
  payload jsonb,
  private boolean not null default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select on realtime.messages to anon, authenticated;
create function realtime.topic() returns text
language sql stable
as $$ select nullif(current_setting('realtime.topic', true), '') $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language sql
security definer
as $$
  insert into realtime.messages (topic, extension, event, payload, private)
  values (topic, 'broadcast', event, payload, private)
$$;
`;

/** Crea la base, aplica shims, TODAS las migraciones reales y el seed real. */
async function createSupabaseSim() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(SHIM_SQL);

  const migrationsDir = path.join(ROOT, "supabase", "migrations");
  const files = (await readdir(migrationsDir)).filter(f => f.endsWith(".sql")).sort();
  if (!files.length) throw new Error("No hay migraciones en supabase/migrations/");
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }
  await db.exec(await readFile(path.join(ROOT, "supabase", "seed.sql"), "utf8"));
  return db;
}

/**
 * Ejecuta fn con el rol y el usuario (claim sub) indicados y SIEMPRE
 * restaura el superusuario al salir, incluso si fn lanza.
 */
async function withRole(db, role, sub, fn) {
  const claims = sub ? JSON.stringify({ sub, role }) : "";
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec(`set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

/** Espera que fn lance con un mensaje que matchee el patrón. Devuelve el error. */
async function expectError(fn, pattern) {
  try {
    await fn();
  } catch (error) {
    if (pattern && !pattern.test(String(error.message))) {
      throw new Error(`Falló con otro error: "${error.message}" (se esperaba ${pattern})`);
    }
    return error;
  }
  throw new Error(`Se esperaba un error ${pattern || ""} y la operación fue aceptada`);
}

module.exports = { createSupabaseSim, withRole, expectError, ROOT };
