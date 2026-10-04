import "dotenv/config";

// Business time zone must be set before any Date maths happens.
process.env.TZ = process.env.TZ || "Australia/Adelaide";

const bool = (v, d) => (v === undefined ? d : ["1", "true", "yes", "on"].includes(String(v).toLowerCase()));
const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 4000),
  env: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL,
  dbSsl: process.env.DATABASE_SSL === undefined ? undefined : bool(process.env.DATABASE_SSL, true),
  dbPoolSize: num(process.env.DATABASE_POOL_SIZE, 10),
  businessTz: process.env.TZ,
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
  farmName: process.env.FARM_NAME || "Your farm",
  cookieName: "ft_session",

  // Compliance rule used for new clock events and break checks (v3: no is_active column).
  activeRuleId: num(process.env.ACTIVE_RULE_ID, 2),

  // Security settings (v3: no settings table, so these live in server config).
  lockoutAttempts: num(process.env.LOCKOUT_ATTEMPTS, 5),
  lockoutMinutes: num(process.env.LOCKOUT_MINUTES, 15),
  adminIdleMinutes: num(process.env.ADMIN_IDLE_MINUTES, 30),
  sessionHours: num(process.env.SESSION_HOURS, 12),
  pinValidHours: num(process.env.PIN_VALID_HOURS, 72),

  // Pay (proof of concept, agreed with the DB team):
  // ordinary hours capped at 76 per fortnight, the rest is overtime;
  // weekend and public holiday hours are paid at the staff member's overtime rate.
  ordinaryHoursPerFortnight: 76,
  payPeriodAnchor: process.env.PAY_PERIOD_ANCHOR || "2026-08-31", // a Monday that starts a fortnight
  holidayState: process.env.HOLIDAY_STATE || "SA",
  mealBreakMinutes: 30, // roster end = start + expected hours + 30 min unpaid meal for shifts over 5 h
  mealBreakAfterHours: 5,
  missingClockOutGraceHours: 2,
  // An open shift older than this is treated as a missing clock-out: the person can clock in again
  // and the old shift waits for a correction instead of growing forever.
  maxOpenShiftHours: 16,
};
