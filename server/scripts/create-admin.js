// Creates (or re-enables) an Office Admin. Every login is linked to a staff row,
// so this also creates the staff record (no pay rows unless they clock in).
//   npm run create-admin -- --first "Sam" --last "Patel" --email sam@farm.com.au [--password "..."] [--rate 35]
//   npm run create-admin -- --name "Sam Patel" --email sam@farm.com.au   (also accepted)
import { parseArgs } from "node:util";
import readline from "node:readline/promises";
import bcrypt from "bcryptjs";
import { openDb, migrate } from "../src/db.js";

const usage = 'Usage: npm run create-admin -- --first "First" --last "Last" --email you@farm.com.au\n   or: npm run create-admin -- --name "First Last" --email you@farm.com.au';
let values;
try {
  ({ values } = parseArgs({ options: { first: { type: "string" }, last: { type: "string" }, name: { type: "string" }, email: { type: "string" }, password: { type: "string" }, rate: { type: "string" } } }));
} catch (e) {
  console.error(`${e.message}\n${usage}`);
  process.exit(1);
}
const parts = (values.name || "").trim().split(/\s+/).filter(Boolean);
const first = (values.first || parts[0] || "").trim();
const last = (values.last || parts.slice(1).join(" ")).trim();
const email = values.email?.trim().toLowerCase();
if (!first || !last) {
  console.error(`Give a first and last name (the staff table needs both).\n${usage}`);
  process.exit(1);
}
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error(`Give a valid email.\n${usage}`);
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
const rate = Number(values.rate || 35);

const db = openDb();
await migrate(db);
const hash = await bcrypt.hash(password, 12);
const existing = await db.prepare("SELECT user_id, staff_id FROM users WHERE lower(email) = ?").get(email);
await db.transaction(async () => {
  let staffId = existing?.staff_id;
  if (!staffId) {
    staffId = (await db.prepare("INSERT INTO staff (first_name, last_name, contract_type, standard_hours, role, standard_rate, overtime_rate) VALUES (?, ?, 'Full Time', 38, 'Office Admin', ?, ?) RETURNING staff_id").get(first, last, rate, Math.round(rate * 150) / 100)).staff_id;
  } else {
    await db.prepare("UPDATE staff SET removed_at = NULL, removed_by = NULL WHERE staff_id = ?").run(staffId);
  }
  let userId = existing?.user_id;
  if (userId) await db.prepare("UPDATE users SET password_hash = ?, disabled = FALSE, password_changed_at = now() WHERE user_id = ?").run(hash, userId);
  else userId = (await db.prepare("INSERT INTO users (staff_id, email, password_hash, name, password_changed_at) VALUES (?, ?, ?, ?, now()) RETURNING user_id").get(staffId, email, hash, `${first} ${last}`)).user_id;
  await db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, 'Office Admin') ON CONFLICT DO NOTHING").run(userId);
  await db.prepare("INSERT INTO audit_logs (table_name, record_id, action, reason, changed_by) VALUES ('staff', ?, ?, ?, ?)").run(staffId, existing ? "UPDATE" : "INSERT", existing ? `Office Admin login reset from the command line (${email})` : `Office Admin created from the command line (${email})`, staffId);
});
console.log(`\n  ${existing ? "Updated" : "Created"} Office Admin ${first} ${last} <${email}>.`);
console.log("  Sign in through the Admin portal; you'll be asked to set up an authenticator app.\n");
await db.close();
