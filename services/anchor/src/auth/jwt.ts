import { ORBIT_URL, ANCHOR_JWT_TTL_SEC, jwtSecret, userId } from "../config";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function signJwtHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encoder = new TextEncoder();
  const headerPart = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadPart = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const data = encoder.encode(`${headerPart}.${payloadPart}`);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const signaturePart = base64UrlEncode(signature);
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

export async function buildOrbitUrl(): Promise<string | null> {
  if (!ORBIT_URL) return null;
  try {
    const url = new URL(ORBIT_URL);
    if (jwtSecret) {
      const now = Math.floor(Date.now() / 1000);
      const token = await signJwtHs256(
        {
          iss: "zane-anchor",
          aud: "zane-orbit-anchor",
          sub: userId,
          iat: now,
          exp: now + ANCHOR_JWT_TTL_SEC,
        },
        jwtSecret
      );
      url.searchParams.set("token", token);
    }
    return url.toString();
  } catch (err) {
    console.error("[anchor] invalid ANCHOR_ORBIT_URL", err);
    return null;
  }
}
