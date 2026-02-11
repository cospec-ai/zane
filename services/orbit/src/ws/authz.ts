import type { AuthResult, Env, Role } from "../types";
import { getAuthToken, verifyOrbitAnchorJwt, verifyOrbitUserJwt } from "../utils/jwt";

export function getRoleFromPath(pathname: string): Role | null {
  if (pathname === "/ws/client") return "client";
  if (pathname === "/ws/anchor") return "anchor";
  return null;
}

export async function isAuthorised(req: Request, env: Env): Promise<AuthResult> {
  const denied: AuthResult = { authorised: false, userId: null, jwtType: null };

  const userSecret = env.ZANE_WEB_JWT_SECRET?.trim();
  const anchorSecret = env.ZANE_ANCHOR_JWT_SECRET?.trim();
  if (!userSecret && !anchorSecret) {
    console.error("[orbit] auth: no secrets configured, denying request");
    return denied;
  }

  const provided = (getAuthToken(req) ?? "").trim();
  if (!provided) {
    console.warn("[orbit] auth: missing token");
    return denied;
  }

  const user = await verifyOrbitUserJwt(provided, env);
  if (user.ok) {
    console.log(`[orbit] auth: web JWT accepted, userId=${user.userId}`);
    return { authorised: true, userId: user.userId, jwtType: "web" };
  }

  const anchor = await verifyOrbitAnchorJwt(provided, env);
  if (anchor.ok) {
    console.log(`[orbit] auth: anchor JWT accepted, userId=${anchor.userId}`);
    return { authorised: true, userId: anchor.userId, jwtType: "anchor" };
  }

  console.warn("[orbit] auth: token rejected");
  return denied;
}
