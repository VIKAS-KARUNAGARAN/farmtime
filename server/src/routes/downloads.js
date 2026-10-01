// One-time download links. The browser opens /api/downloads/:token directly,
// so exports work without putting the session token in a URL.
import crypto from "node:crypto";
import { Router } from "express";
import { notFound } from "../errors.js";

const TTL_MS = 2 * 60_000;

export async function createDownload(db, filename, mime, body) {
  const token = crypto.randomBytes(24).toString("base64url");
  await db.prepare("DELETE FROM downloads WHERE expires_at < ?").run(new Date().toISOString());
  await db.prepare("INSERT INTO downloads (token, filename, mime, body, expires_at) VALUES (?, ?, ?, ?, ?)").run(
    token, filename, mime, body, new Date(Date.now() + TTL_MS).toISOString()
  );
  return { downloadUrl: `/api/downloads/${token}`, filename, expiresInSeconds: TTL_MS / 1000 };
}

export function downloadRoutes(db) {
  const r = Router();
  r.get("/:token", async (req, res) => {
    const d = await db.prepare("SELECT * FROM downloads WHERE token = ?").get(req.params.token);
    if (!d || new Date(d.expires_at) < new Date()) throw notFound("This download link has expired. Export again.");
    await db.prepare("DELETE FROM downloads WHERE token = ?").run(d.token); // single use
    res.setHeader("Content-Type", `${d.mime}; charset=utf-8`);
    res.setHeader("Content-Disposition", `attachment; filename="${d.filename.replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(d.body);
  });
  return r;
}
