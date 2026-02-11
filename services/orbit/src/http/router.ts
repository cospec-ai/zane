import { Hono } from "hono";
import { handleAuthRequest } from "../auth/index";
import type { Env } from "../types";
import { orbitCorsHeaders } from "../utils/cors";
import { fetchThreadEvents } from "./events";
import { isAuthorised } from "../ws/authz";

export function createHttpApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", () => new Response(null, { status: 200 }));

  app.all("/auth/*", async (c) => {
    const response = await handleAuthRequest(c.req.raw, c.env);
    return response ?? new Response("Not found", { status: 404 });
  });

  app.options("/threads/:id/events", (c) => {
    const origin = c.req.raw.headers.get("origin");
    return new Response(null, { status: 204, headers: orbitCorsHeaders(origin, c.env) });
  });

  app.get("/threads/:id/events", async (c) => {
    const req = c.req.raw;
    const origin = req.headers.get("origin");
    const authResult = await isAuthorised(req, c.env);
    if (!authResult.authorised) {
      console.warn(`[orbit] events auth failed: ${new URL(req.url).pathname}`);
      return new Response("Unauthorised", { status: 401, headers: orbitCorsHeaders(origin, c.env) });
    }
    console.log(`[orbit] events request: ${new URL(req.url).pathname}`);
    return fetchThreadEvents(req, c.env, authResult.userId);
  });

  return app;
}
