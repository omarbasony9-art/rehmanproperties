import crypto from "crypto";
import { logger } from "./logger";

// ─── Stateless session tokens ──────────────────────────────────────────────
//
// Tokens are HMAC-SHA256 signed so they survive server restarts without any
// shared in-memory state. Format: `payload.timestamp.signature`
//   payload   – 32 random bytes (hex)
//   timestamp – ms since epoch (hex) — used to enforce the 24h TTL
//   signature – HMAC-SHA256(payload + "." + timestamp, secret)
//
// Logout on the client clears the token from sessionStorage/cookie, which is
// sufficient for a single-admin system (no revocation list needed).

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function signingSecret(): string {
  return (
    process.env.COOKIE_SECRET ??
    process.env.SESSION_SECRET ??
    "dev-secret-change-in-production"
  );
}

function sign(payload: string, ts: string): string {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(`${payload}.${ts}`)
    .digest("hex");
}

export function createSession(): string {
  const payload = crypto.randomBytes(32).toString("hex");
  const ts = Date.now().toString(16);
  const sig = sign(payload, ts);
  return `${payload}.${ts}.${sig}`;
}

export function validateSession(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [payload, ts, sig] = parts;

  // Verify signature (constant-time)
  const expected = sign(payload, ts);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return false;
    }
  } catch {
    return false;
  }

  // Enforce TTL
  const issuedAt = parseInt(ts, 16);
  if (isNaN(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) return false;

  return true;
}

// No-op: stateless tokens can't be individually revoked server-side.
// Clients clear the token from sessionStorage/cookie on logout.
export function destroySession(_token: string): void {
  // intentionally empty
}

// ─── Login rate limiting ───────────────────────────────────────────────────

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_MS = 10 * 60 * 1000;  // 10 minutes

export function checkLoginRateLimit(ip: string): { allowed: boolean; lockedFor?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil > now) {
    return { allowed: false, lockedFor: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    logger.warn({ ip, lockedUntil: new Date(entry.lockedUntil).toISOString() }, "Admin login: IP locked out");
  }
  loginAttempts.set(ip, entry);
  if (Math.random() < 0.05) {
    for (const [k, v] of loginAttempts) {
      if (v.lockedUntil < now - WINDOW_MS && v.count < MAX_ATTEMPTS) loginAttempts.delete(k);
    }
  }
}

export function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// ─── Password hashing (PBKDF2, no external deps) ──────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = crypto
      .pbkdf2Sync(password, salt, 100_000, 64, "sha512")
      .toString("hex");
    return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export function checkAdminPassword(password: string, storedHash?: string | null): boolean {
  if (storedHash) {
    return verifyPasswordHash(password, storedHash);
  }
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    logger.warn("ADMIN_PASSWORD environment variable is not set");
    return false;
  }
  if (password.length !== adminPassword.length) {
    // Run the comparison anyway to avoid timing leaks
    crypto.timingSafeEqual(
      Buffer.from(password.padEnd(adminPassword.length)),
      Buffer.from(adminPassword),
    );
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(adminPassword));
  } catch {
    return false;
  }
}
