// PostgreSQL access (Supabase or any Postgres 13+).
//   await db.prepare("SELECT * FROM staff WHERE staff_id = ?").get(id)
//   await db.prepare("...").all(a, b)   -> rows
//   await db.prepare("...").run(a, b)   -> { changes, rows }
//   await db.transaction(async () => { ...any db calls... })
// `?` placeholders become $1, $2... Calls inside db.transaction() run on the
// transaction's client automatically (AsyncLocalStorage).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { config } from "./config.js";

pg.types.setTypeParser(20, (v) => Number(v)); // bigint (COUNT)
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric / DECIMAL
pg.types.setTypeParser(1082, (v) => v); // date stays 'YYYY-MM-DD'

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.join(here, "..", "sql");
export const SQL_FILES = {
  schema: path.join(sqlDir, "schema.sql"), // master schema from the DB team (do not edit here)
  views: path.join(sqlDir, "views.sql"), // DB team's reporting views
  reference: path.join(sqlDir, "reference_data.sql"),
  security: path.join(sqlDir, "security.sql"),
};

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
  // Supabase sessions default to UTC; dates and "today" must be Adelaide days,
  // so every connection is switched to the business time zone before first use.
  const ready = new WeakSet();
  const checkout = async () => {
    const c = await pool.connect();
    if (!ready.has(c)) {
      await c.query(`SET TIME ZONE '${config.businessTz}'`);
      ready.add(c);
    }
    return c;
  };
  const als = new AsyncLocalStorage();
  const onClient = async (fn) => {
    const store = als.getStore();
    if (store) return fn(store);
    const c = await checkout();
    try {
      return await fn(c);
    } finally {
      c.release();
    }
  };
  const q = (sql, params) => onClient((c) => c.query(toPg(sql), params));

  return {
    pool,
    prepare(sql) {
      return {
        get: async (...p) => (await q(sql, p)).rows[0],
        all: async (...p) => (await q(sql, p)).rows,
        run: async (...p) => {
          const r = await q(sql, p);
          return { changes: r.rowCount, rows: r.rows };
        },
      };
    },
    exec: (sql) => onClient((c) => c.query(sql)),
    async transaction(fn) {
      if (als.getStore()) return fn();
      const client = await checkout();
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
}

const read = (f) => fs.readFileSync(f, "utf8").replace(/\r/g, "");

/**
 * Creates the master schema on an empty database, then (re)applies the views,
 * reference data and security file. Never drops or alters existing tables.
 */
export async function migrate(db, { log = () => {} } = {}) {
  const exists = (await db.prepare("SELECT to_regclass('public.staff') AS t").get()).t;
  if (!exists) {
    await db.exec(read(SQL_FILES.schema));
    log("Created tables from sql/schema.sql");
  }
  await db.exec(read(SQL_FILES.views));
  await db.exec(read(SQL_FILES.reference));
  await db.exec(read(SQL_FILES.security));
  log("Applied views, reference data and security settings");
}

export async function userCount(db) {
  return (await db.prepare("SELECT COUNT(*) AS n FROM users").get()).n;
}
