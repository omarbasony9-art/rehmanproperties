import crypto from "crypto";
import { logger } from "./logger";

// In-memory session store
const sessions = new Set<string>();

// Login rate limiting: track failed attempts per IP
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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
  // Auto-cleanup old entries periodically
  if (Math.random() < 0.05) {
    for (const [k, v] of loginAttempts) {
      if (v.lockedUntil < now - WINDOW_MS && v.count < MAX_ATTEMPTS) loginAttempts.delete(k);
    }
  }
}

export function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

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

// PBKDF2-based password hashing (no external deps)
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
  // If a DB hash override exists, use it
  if (storedHash) {
    return verifyPasswordHash(password, storedHash);
  }
  // Fall back to env var plaintext (initial state)
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    logger.warn("ADMIN_PASSWORD environment variable is not set");
    return false;
  }
  if (password.length !== adminPassword.length) {
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
