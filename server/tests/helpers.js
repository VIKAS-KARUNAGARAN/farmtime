// Starts a throwaway PostgreSQL (or uses TEST_DATABASE_URL), creates the DB team's
// schema, then loads their dev seed and the dev test logins.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
process.env.FARMTIME_QUIET_LOGS = "1";
import { openDb, migrate } from "../src/db.js";

const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "seed");

async function prepare(db, { seed }) {
  await migrate(db);
  if (seed) {
    await db.exec(fs.readFileSync(path.join(seedDir, "dev_seed.sql"), "utf8"));
    await migrate(db);
    await db.exec(fs.readFileSync(path.join(seedDir, "dev_logins.sql"), "utf8"));
  }
}

export async function startDb({ seed = true } = {}) {
  if (process.env.TEST_DATABASE_URL) {
    const db = openDb(process.env.TEST_DATABASE_URL);
    await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await prepare(db, { seed });
    return { db, stop: () => db.close() };
  }
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmtime-pg-"));
  const port = 54000 + Math.floor(Math.random() * 900);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "farmtime", password: "farmtime", port, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("farmtime_test");
  const db = openDb(`postgres://farmtime:farmtime@localhost:${port}/farmtime_test`);
  await prepare(db, { seed });
  return {
    db,
    stop: async () => {
      await db.close();
      await pg.stop();
    },
  };
}
