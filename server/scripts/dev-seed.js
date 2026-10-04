// DEV / TEST ONLY: loads the DB team's seed (wipes every table) plus test logins.
// Refuses to run unless ALLOW_DEV_SEED=yes, so it can't hit the live database by accident.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, migrate } from "../src/db.js";

if (process.env.ALLOW_DEV_SEED !== "yes") {
  console.error("Refusing to run: this wipes all tables. Set ALLOW_DEV_SEED=yes on a dev or test database only.");
  process.exit(1);
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "seed");
const db = openDb();
await migrate(db);
await db.exec(fs.readFileSync(path.join(dir, "dev_seed.sql"), "utf8"));
await migrate(db); // re-add reference holidays the seed truncated
await db.exec(fs.readFileSync(path.join(dir, "dev_logins.sql"), "utf8"));
console.log("Dev seed loaded. Logins: firstname.lastname@farmtime.test / FarmTime-Dev-2026");
await db.close();
