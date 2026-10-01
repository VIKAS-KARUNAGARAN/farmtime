import { config } from "./config.js";
import { openDb, migrate, userCount } from "./db.js";
import { createApp } from "./app.js";

const db = openDb();
await migrate(db);
if ((await userCount(db)) === 0) {
  console.warn("\n  No accounts yet. Create the first admin with:\n    npm run create-admin -- --name \"Your Name\" --email you@farm.com.au\n");
}

const app = createApp(db);
const server = app.listen(config.port, () => {
  console.log(`FarmTime API listening on http://localhost:${config.port}  (TZ ${process.env.TZ})`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => db.close().then(() => process.exit(0))));
}
