// Creates (or re-enables) an admin account.
//   npm run create-admin -- --name "Sam Patel" --email sam@farm.com.au [--password "..."] [--staff]
// Without --password you are prompted for one. The admin sets up an authenticator app
// (Google Authenticator, Microsoft Authenticator, 1Password...) at their first admin sign-in.
import { parseArgs } from "node:util";
import readline from "node:readline/promises";
import bcrypt from "bcryptjs";
import { openDb, migrate } from "../src/db.js";
import { id, initialsOf, nowIso } from "../src/util.js";

const { values } = parseArgs({ options: { name: { type: "string" }, email: { type: "string" }, password: { type: "string" }, title: { type: "string" } } });
const name = values.name?.trim();
const email = values.email?.trim().toLowerCase();
if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: npm run create-admin -- --name "First Last" --email you@farm.com.au');
  process.exit(1);
}
let password = values.password;
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question("Password (10+ characters): ");
  rl.close();
}
if (!password || password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const db = openDb();
await migrate(db);
const hash = await bcrypt.hash(password, 12);
const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
const userId = existing?.id ?? id("u");
await db.transaction(async () => {
  if (existing) {
    await db.prepare("UPDATE users SET password_hash = ?, disabled = 0, password_changed_at = ? WHERE id = ?").run(hash, nowIso(), userId);
  } else {
    await db.prepare("INSERT INTO users (id, email, password_hash, name, title, initials, password_changed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      userId, email, hash, name, values.title || "Farm manager", initialsOf(name), nowIso(), nowIso()
    );
  }
  await db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, 'admin') ON CONFLICT DO NOTHING").run(userId);
  await db.prepare("INSERT INTO audit_log (at, actor_name, action, target, source, level) VALUES (?, 'System', ?, ?, 'Command line', 'security')").run(
    nowIso(), existing ? "Reset admin account" : "Created admin account", email
  );
});
console.log(`\n  ${existing ? "Updated" : "Created"} admin ${name} <${email}>.`);
console.log("  Sign in through the Admin portal; you'll be asked to set up an authenticator app.\n");
await db.close();
