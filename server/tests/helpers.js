// Starts a throwaway PostgreSQL for the tests (or uses TEST_DATABASE_URL if you set one).
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openDb, migrate } from "../src/db.js";

export async function startDb() {
  if (process.env.TEST_DATABASE_URL) {
    const db = openDb(process.env.TEST_DATABASE_URL);
    await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate(db);
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
  await migrate(db);
  return {
    db,
    stop: async () => {
      await db.close();
      await pg.stop();
    },
  };
}
