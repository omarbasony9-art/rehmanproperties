// Web Crypto API auth helpers — no Node.js required, runs in CF Workers

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map((h) => parseInt(h, 16)));
}

// ─── Session tokens ────────────────────────────────────────────────────────
// Token format: <32-byte-random-hex>.<HMAC-SHA256-signature-hex>
// Self-verifying — no server-side state required.

export async function createToken(secret: string): Promise<string> {
  const rand = new Uint8Array(32);
  crypto.getRandomValues(rand);
  const hex = toHex(rand.buffer as ArrayBuffer);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(hex));
  return `${hex}.${toHex(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const hex = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sig = fromHex(sigHex);
    return await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(hex));
  } catch {
    return false;
  }
}

// ─── IP hash (for rate-limit keys) ─────────────────────────────────────────

export async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`ip:${ip}`));
  return toHex(sig).slice(0, 16);
}

// ─── Password hashing (PBKDF2-SHA512, same params as Node version) ─────────

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const saltHex = toHex(salt.buffer as ArrayBuffer);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-512", salt, iterations: 100_000 },
    keyMaterial,
    512,
  );
  return `${saltHex}:${toHex(bits)}`;
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  try {
    const colon = stored.indexOf(":");
    if (colon < 0) return false;
    const saltHex = stored.slice(0, colon);
    const hashHex = stored.slice(colon + 1);
    const salt = fromHex(saltHex);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-512", salt, iterations: 100_000 },
      keyMaterial,
      512,
    );
    const derived = toHex(bits);

    // Constant-time string comparison
    if (derived.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) {
      diff |= derived.charCodeAt(i) ^ hashHex.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function checkAdminPassword(
  password: string,
  storedHash: string | null | undefined,
  adminPassword: string | undefined,
): Promise<boolean> {
  if (storedHash) {
    return verifyPasswordHash(password, storedHash);
  }
  if (!adminPassword) return false;
  // Constant-time comparison for plain-text fallback
  const a = password;
  const b = adminPassword;
  const len = Math.max(a.length, b.length);
  let diff = a.length !== b.length ? 1 : 0;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}
