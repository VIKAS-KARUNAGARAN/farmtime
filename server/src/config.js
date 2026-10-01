import "dotenv/config";

// Business time zone must be set before any Date maths happens.
process.env.TZ = process.env.TZ || "Australia/Adelaide";

const bool = (v, d) => (v === undefined ? d : ["1", "true", "yes", "on"].includes(String(v).toLowerCase()));

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || "development",
  dbFile: process.env.DATABASE_FILE || "./data/farmtime.db",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  demoMode: bool(process.env.DEMO_MODE, true),
  demoMfaCode: process.env.DEMO_MFA_CODE || "246810",
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  cookieName: "ft_session",
  minimumWage: 24.95, // AUD per hour, national minimum wage
  superRate: 0.115,
  ordinaryHoursPerFortnight: 76,
  overtimeMultiplier: 1.5,
};
