// PostgreSQL access (Supabase or any Postgres 13+).
//
// A tiny wrapper keeps queries readable:
//   await db.prepare("SELECT * FROM users WHERE id = ?").get(id)
//   await db.prepare("...").all(a, b)     -> rows
//   await db.prepare("...").run(a, b)     -> { changes }
//   await db.transaction(async () => { ...any db calls... })
// `?` placeholders are converted to $1, $2... Calls made inside db.transaction()
// automatically run on the transaction's client (AsyncLocalStorage).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { config } from "./config.js";

// COUNT(*) and SUM() come back as bigint/numeric strings; parse them as numbers.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_FILE = path.join(here, "..", "sql", "schema.sql");

const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

export function openDb(url = config.databaseUrl) {
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection string.");
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: local || config.dbSsl === false ? false : { rejectUnauthorized: false },
    max: config.dbPoolSize,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (e) => console.error("Postgres pool error:", e.message));
  const als = new AsyncLocalStorage();
  const q = (sql, params) => (als.getStore() ?? pool).query(toPg(sql), params);

  const db = {
    pool,
    prepare(sql) {
      return {
        get: async (...p) => (await q(sql, p)).rows[0],
        all: async (...p) => (await q(sql, p)).rows,
        run: async (...p) => ({ changes: (await q(sql, p)).rowCount }),
      };
    },
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      if (als.getStore()) return fn(); // already inside one
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await als.run(client, fn);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  return db;
}

export async function migrate(db) {
  await db.exec(fs.readFileSync(SCHEMA_FILE, "utf8"));
}

export async function userCount(db) {
  return (await db.prepare("SELECT COUNT(*) AS n FROM users").get()).n;
}
