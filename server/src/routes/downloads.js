// One-time download links held in memory (v3 has no downloads table).
// The browser opens /api/downloads/:token directly, so exports work without
// putting the session token in a URL. Links expire after 2 minutes.
import crypto from "node:crypto";
import { Router } from "express";
import { notFound } from "../errors.js";

const TTL_MS = 2 * 60_000;
const store = new Map();

export function createDownload(filename, mime, body) {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires < now) store.delete(k);
  const token = crypto.randomBytes(24).toString("base64url");
  store.set(token, { filename, mime, body, expires: now + TTL_MS });
  return { downloadUrl: `/api/downloads/${token}`, filename, expiresInSeconds: TTL_MS / 1000 };
}

export function downloadRoutes() {
  const r = Router();
  r.get("/:token", (req, res) => {
    const d = store.get(req.params.token);
    store.delete(req.params.token); // single use
    if (!d || d.expires < Date.now()) throw notFound("This download link has expired. Export again.");
    res.setHeader("Content-Type", `${d.mime}; charset=utf-8`);
    res.setHeader("Content-Disposition", `attachment; filename="${d.filename.replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(d.body);
  });
  return r;
}
