import { openDb, migrate } from "../src/db.js";
const db = openDb();
await migrate(db);
console.log("Schema is up to date.");
await db.close();
