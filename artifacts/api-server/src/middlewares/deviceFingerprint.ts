/**
 * Records a device fingerprint (hash of IP + User-Agent) for every
 * authenticated request and emits a `new_device` security event the first
 * time we see a fingerprint for a user.
 *
 * Mount AFTER `requireAuth` so `req.userId` is populated.
 */
import type { RequestHandler } from "express";
import {
  deviceFingerprint,
  noteCountry,
  noteDevice,
  recordEvent,
} from "../lib/securityEvents";
import { notifyUser } from "../lib/notifyUser";
import { getCountry } from "../lib/geoip";

export function trackDevice(): RequestHandler {
  return (req, _res, next) => {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return next();
    const ip = req.ip ?? "unknown";
    const ua = String(req.headers["user-agent"] ?? "");
    const fp = deviceFingerprint(ip, ua);
    const country = getCountry(req);

    if (noteDevice(userId, fp)) {
      recordEvent({
        userId,
        kind: "new_device",
        message: "Signed in from a new device or network.",
        ip,
        userAgent: ua,
      });
      void notifyUser({
        userId,
        kind: "new_device",
        subject: "New sign-in to your Finsyt account",
        body: `We detected a sign-in from a device we haven't seen before (IP ${ip}${country ? `, ${country}` : ""}). If this wasn't you, revoke the session under Account & Security.`,
      });
    }

    if (noteCountry(userId, country)) {
      recordEvent({
        userId,
        kind: "new_country",
        message: `Signed in from a new country (${country}).`,
        ip,
        userAgent: ua,
      });
      void notifyUser({
        userId,
        kind: "suspicious_attempt",
        subject: "Sign-in from a new location",
        body: `We saw a sign-in from ${country} (IP ${ip}) — somewhere we haven't seen you before. If this wasn't you, change your password.`,
      });
    }

    next();
  };
}
