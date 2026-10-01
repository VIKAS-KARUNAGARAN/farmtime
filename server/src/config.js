import "dotenv/config";

// Business time zone must be set before any Date maths happens.
process.env.TZ = process.env.TZ || "Australia/Adelaide";

const bool = (v, d) => (v === undefined ? d : ["1", "true", "yes", "on"].includes(String(v).toLowerCase()));

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL,
  dbSsl: process.env.DATABASE_SSL === undefined ? undefined : bool(process.env.DATABASE_SSL, true),
  dbPoolSize: Number(process.env.DATABASE_POOL_SIZE || 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
  farmName: process.env.FARM_NAME || "Your farm",
  cookieName: "ft_session",
  minimumWage: 24.95, // AUD per hour, national minimum wage
  superRate: 0.115,
  ordinaryHoursPerFortnight: 76,
  overtimeMultiplier: 1.5,
};
