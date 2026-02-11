import type { Env } from "../types";
import { getRoleFromPath, isAuthorised } from "./authz";

export async function handleWsRequest(req: Request, env: Env): Promise<Response | null> {
  const url = new URL(req.url);
  const role = getRoleFromPath(url.pathname);
  if (!role) return null;

  const authResult = await isAuthorised(req, env);
  if (!authResult.authorised) {
    console.warn(`[orbit] ws auth failed: ${url.pathname}`);
    return new Response("Unauthorised", { status: 401 });
  }

  if (!authResult.userId) {
    console.warn("[orbit] ws auth: no userId in token");
    return new Response("Unauthorised: missing user identity", { status: 401 });
  }

  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Upgrade required", { status: 426 });
  }

  console.log(`[orbit] ws upgrade accepted: ${url.pathname} userId=${authResult.userId}`);
  const id = env.ORBIT_DO.idFromName(authResult.userId);
  const stub = env.ORBIT_DO.get(id);
  const nextReq = new Request(req, { headers: new Headers(req.headers) });
  nextReq.headers.set("x-orbit-role", role);
  nextReq.headers.set("x-orbit-user-id", authResult.userId);
  return stub.fetch(nextReq);
}
