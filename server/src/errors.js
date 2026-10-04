import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(status, message, code = undefined, extra = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (m, code) => new HttpError(400, m, code);
export const unauthorized = (m = "Please sign in.", code = "UNAUTHENTICATED") => new HttpError(401, m, code);
export const forbidden = (m = "You don’t have permission to do that.", code = "FORBIDDEN") => new HttpError(403, m, code);
export const notFound = (m = "Not found.") => new HttpError(404, m, "NOT_FOUND");
export const conflict = (m, code = "CONFLICT") => new HttpError(409, m, code);

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({
      error: first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request.",
      code: "VALIDATION",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra || {}) });
  }
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body.", code: "BAD_JSON" });
  console.error(err);
  // The preview proxy turns 5xx into 422, so the message matters more than the code.
  res.status(500).json({ error: "Something went wrong on the server.", code: "INTERNAL" });
}
