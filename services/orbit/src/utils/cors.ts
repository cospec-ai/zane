import type { Env } from "../types";

function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  try {
    if (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) return true;
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

export function orbitCorsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowedOrigin = isAllowedOrigin(origin, env) ? (origin ?? "null") : "null";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    vary: "origin",
  };
}
