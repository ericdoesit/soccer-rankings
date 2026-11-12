/**
 * Database client.
 *
 *  - DATABASE_URL set   → Neon serverless Postgres (production / Vercel)
 *  - DATABASE_URL unset → PGlite, an embedded Postgres stored in data/pglite/
 *                         (local development; no server or account needed)
 *
 * Both run the same Drizzle schema and migrations (./drizzle).
 */
import path from "path";
import * as schema from "./schema";

export const PGLITE_DIR = path.join(process.cwd(), "data", "pglite");
export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

async function createDb() {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(process.env.DATABASE_URL), { schema });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  return drizzle(new PGlite(PGLITE_DIR), { schema }) as unknown as Awaited<
    ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>>
  >;
}

export type DB = Awaited<ReturnType<typeof createDb>>;

let _db: Promise<DB> | null = null;
export function getDb(): Promise<DB> {
  return (_db ??= createDb());
}

/** Apply pending migrations from ./drizzle. */
export async function migrateDb() {
  const db = await getDb();
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: MIGRATIONS_DIR });
  }
}

export * from "./schema";
