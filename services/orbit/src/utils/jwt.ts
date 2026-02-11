import type { Env } from "../types";

export function getAuthToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const url = new URL(req.url);
  return url.searchParams.get("token");
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseJwtPart<T>(part: string): T | null {
  try {
    const text = new TextDecoder().decode(base64UrlToBytes(part));
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function verifyJwtHs256(
  token: string,
  secret: string,
  expected: { issuer: string; audience: string },
  clockSkewSec = 30
): Promise<boolean> {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) return false;

  const header = parseJwtPart<{ alg?: string }>(headerPart);
  if (!header || header.alg !== "HS256") return false;

  const payload = parseJwtPart<{
    iss?: string;
    aud?: string | string[];
    exp?: number;
  }>(payloadPart);
  if (!payload) return false;
  if (payload.iss !== expected.issuer) return false;
  if (payload.aud) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(expected.audience)) return false;
  }
  if (typeof payload.exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp + clockSkewSec) return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = new Uint8Array(new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  const signatureBytes = base64UrlToBytes(signaturePart);
  const signature = new Uint8Array(signatureBytes);
  return await crypto.subtle.verify("HMAC", key, signature, data);
}

export function extractJwtSub(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parseJwtPart<{ sub?: string }>(parts[1]);
  return payload?.sub ?? null;
}

export async function verifyOrbitUserJwt(token: string, env: Env): Promise<{ ok: boolean; userId: string | null }> {
  const secret = env.ZANE_WEB_JWT_SECRET?.trim();
  if (!secret) return { ok: false, userId: null };
  const ok = await verifyJwtHs256(token, secret, {
    issuer: "zane-auth",
    audience: "zane-web",
  });
  return { ok, userId: ok ? extractJwtSub(token) : null };
}

export async function verifyOrbitAnchorJwt(token: string, env: Env): Promise<{ ok: boolean; userId: string | null }> {
  const secret = env.ZANE_ANCHOR_JWT_SECRET?.trim();
  if (!secret) return { ok: false, userId: null };
  const ok = await verifyJwtHs256(token, secret, {
    issuer: "zane-anchor",
    audience: "zane-orbit-anchor",
  });
  return { ok, userId: ok ? extractJwtSub(token) : null };
}
