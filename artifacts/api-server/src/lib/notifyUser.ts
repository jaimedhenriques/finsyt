/**
 * Transactional notification stub for security-relevant events. Today this
 * just emits a structured log line so SOC 2 evidence collection can ingest
 * it; in production wire this to the transactional email provider (Resend /
 * SendGrid / SES) and template the message via Clerk's user email lookup.
 *
 * Returning a Promise keeps the call site identical once a real provider is
 * plugged in — there is no silent fallback that pretends an email was sent
 * when no provider is configured.
 */
import { logger } from "./logger";

export interface SecurityNotification {
  userId: string;
  kind: "lockout" | "new_device" | "suspicious_attempt";
  subject: string;
  body: string;
}

export async function notifyUser(n: SecurityNotification): Promise<void> {
  logger.warn(
    {
      securityNotification: true,
      userId: n.userId,
      kind: n.kind,
      subject: n.subject,
    },
    n.body,
  );
}
