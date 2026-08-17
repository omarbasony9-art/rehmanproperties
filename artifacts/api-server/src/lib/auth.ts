import crypto from "crypto";
import { logger } from "./logger";

// In-memory session store — sufficient for single-process deployments.
// For multi-process/Cloudflare Workers production, replace with KV/Durable Objects.
const sessions = new Set<string>();

export function createSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.add(token);
  return token;
}

export function validateSession(token: string | undefined): boolean {
  if (!token) return false;
  return sessions.has(token);
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

export function checkAdminPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    logger.warn("ADMIN_PASSWORD environment variable is not set");
    return false;
  }
  if (password.length !== adminPassword.length) {
    // Still do a fake comparison to prevent timing attacks from revealing length
    crypto.timingSafeEqual(
      Buffer.from(password.padEnd(adminPassword.length)),
      Buffer.from(adminPassword),
    );
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(password),
      Buffer.from(adminPassword),
    );
  } catch {
    return false;
  }
}
