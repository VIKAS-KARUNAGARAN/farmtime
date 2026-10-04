// Creates the DB team's schema on an empty database, then applies views,
// reference data (rules, break reasons, SA holidays) and security settings.
// Never drops or changes existing tables.
import { openDb, migrate } from "../src/db.js";
const db = openDb();
await migrate(db, { log: (m) => console.log(m) });
await db.close();
