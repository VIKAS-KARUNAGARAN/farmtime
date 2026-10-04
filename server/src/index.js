import { config } from "./config.js";
import { openDb, migrate, userCount } from "./db.js";
import { createApp } from "./app.js";
import { detectExceptions } from "./domain.js";

const db = openDb();
await migrate(db, { log: (m) => console.log(m) });
if ((await userCount(db)) === 0) {
  console.warn('\n  No logins yet. Create the first Office Admin with:\n    npm run create-admin -- --first "Your" --last "Name" --email you@farm.com.au\n');
}

const app = createApp(db);
const server = app.listen(config.port, () => console.log(`FarmTime API listening on http://localhost:${config.port}  (TZ ${process.env.TZ}, rule ${config.activeRuleId})`));

// Missing clock-outs and overdue breaks are checked every 5 minutes.
const timer = setInterval(() => detectExceptions(db).catch((e) => console.error("Exception check failed:", e.message)), 5 * 60_000);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    clearInterval(timer);
    server.close(() => db.close().then(() => process.exit(0)));
  });
}
