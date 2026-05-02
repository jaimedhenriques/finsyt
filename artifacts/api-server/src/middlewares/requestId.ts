import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response, NextFunction } from "express";

const HEADER = "x-request-id";

/**
 * Accept an upstream X-Request-Id (e.g. from a load balancer or peer service)
 * or generate a fresh UUID. Echo it back on the response and attach it to the
 * request object so log lines can include it.
 */
export function requestId(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = (req.headers[HEADER] as string | undefined)?.trim();
    const id = incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming)
      ? incoming
      : randomUUID();
    (req as any).id = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
