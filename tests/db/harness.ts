import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Supabase 의 auth 스키마·역할을 최소한으로 흉내 낸 뒤 실제 마이그레이션을 실행한다.
 * Realtime 발행(publication)은 없으므로 마이그레이션의 해당 블록은 건너뛴다.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export const STAFF_A = "00000000-0000-4000-8000-00000000000a";
export const STAFF_B = "00000000-0000-4000-8000-00000000000b";
export const OUTSIDER = "00000000-0000-4000-8000-0000000000ff";

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id, email) values
      ('${STAFF_A}', 'a@example.com'), ('${STAFF_B}', 'b@example.com'), ('${OUTSIDER}', 'x@example.com');
    insert into public.staff_members (user_id, display_name) values ('${STAFF_A}', 'A'), ('${STAFF_B}', 'B');
  `);
  return db;
}

type Who = { role: "anon" } | { role: "authenticated"; uid: string };

/** 지정한 역할·사용자로 한 트랜잭션 안에서 쿼리를 실행한다 (PostgREST 의 동작과 같은 방식). */
export async function as<T = Record<string, unknown>>(
  db: PGlite,
  who: Who,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${who.role}`);
    if (who.role === "authenticated") {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who.uid]);
    }
    const res = await tx.query<T>(sql, params);
    return res.rows;
  });
}

export const staff = (uid: string = STAFF_A): Who => ({ role: "authenticated", uid });
export const anon: Who = { role: "anon" };
