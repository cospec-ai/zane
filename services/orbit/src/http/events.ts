import type { Env } from "../types";
import { orbitCorsHeaders } from "../utils/cors";

export async function fetchThreadEvents(req: Request, env: Env, userId: string | null): Promise<Response> {
  const origin = req.headers.get("origin");

  if (!env.DB) {
    return new Response("D1 not configured", { status: 501, headers: orbitCorsHeaders(origin, env) });
  }
  if (!userId) {
    return new Response("Unauthorised: missing user identity", { status: 401, headers: orbitCorsHeaders(origin, env) });
  }

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const threadId = parts.length === 3 ? parts[1] : null;
  if (!threadId) {
    return new Response("Not found", { status: 404, headers: orbitCorsHeaders(origin, env) });
  }

  const query = env.DB.prepare("SELECT payload FROM events WHERE thread_id = ? AND user_id = ? ORDER BY id ASC").bind(threadId, userId);
  const { results } = await query.all<{ payload: string }>();
  const lines = results.map((row) => row.payload).join("\n");
  const body = lines ? `${lines}\n` : "";

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson",
      ...orbitCorsHeaders(origin, env),
    },
  });
}
