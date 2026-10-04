import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { authenticate, requireAuth, requirePortal } from "./auth.js";
import { errorHandler, notFound } from "./errors.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { adminRoutes } from "./routes/admin.js";
import { downloadRoutes } from "./routes/downloads.js";

export function createApp(db, { logRequests = true, authRateLimit = 30 } = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      // Allow configured origins with cookies; other origins can still use Bearer tokens.
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) ? origin || true : false),
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Session-Token"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  );
  app.use(express.json({ limit: "100kb" }));
  if (logRequests) app.use(morgan(config.env === "production" ? "combined" : "dev"));

  // Keys rate limits on the preview proxy's visitor id when present, otherwise the IP.
  const keyGenerator = (req) => String(req.headers["x-visitor-id"] || req.ip);
  const authLimiter = rateLimit({ windowMs: 60_000, limit: authRateLimit, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator, validate: false, message: { error: "Too many requests. Wait a minute and try again.", code: "RATE_LIMITED" } });
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator, validate: false });

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "farmtime-api", time: new Date().toISOString(), tz: process.env.TZ }));

  app.use("/api", apiLimiter, authenticate(db));
  app.use("/api/auth", authLimiter, authRoutes(db));
  app.use("/api/downloads", downloadRoutes());
  app.use("/api/me", requireAuth, requirePortal("staff"), meRoutes(db));
  app.use("/api/admin", requireAuth, requirePortal("admin"), adminRoutes(db));

  app.use("/api", (_req, _res, next) => next(notFound("No such API route.")));
  app.use(errorHandler);
  return app;
}
