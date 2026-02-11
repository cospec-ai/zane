import { createHttpApp } from "./http/router";
import { handleWsRequest } from "./ws/gateway";
import type { Env } from "./types";

export { PasskeyChallengeStore } from "./auth/index";
export { OrbitRelay } from "./relay/orbit-relay-do";

const httpApp = createHttpApp();

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const wsResponse = await handleWsRequest(req, env);
    if (wsResponse) {
      return wsResponse;
    }
    return httpApp.fetch(req, env);
  },
};
