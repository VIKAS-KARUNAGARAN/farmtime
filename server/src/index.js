import { config } from "./config.js";
import { openDb, isEmpty } from "./db.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";

const db = openDb();
if (isEmpty(db)) seed(db);

const app = createApp(db);
const server = app.listen(config.port, () => {
  console.log(`FarmTime API listening on http://localhost:${config.port}  (TZ ${process.env.TZ}, demo mode ${config.demoMode ? "on" : "off"})`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
