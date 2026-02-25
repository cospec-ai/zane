import { ORBIT_URL, FORCE_LOGIN, jwtSecret, userId, setJwtSecret, setUserId } from "./config";
import { loadCredentials } from "./auth/credentials";
import { deviceLogin } from "./auth/device";
import { preflightOrbitConnection, connectOrbit } from "./orbit";
import { ensureAppServer } from "./app-server";
import { server } from "./http";

ensureAppServer();

async function startup() {
  const saved = await loadCredentials();
  if (saved) {
    setJwtSecret(saved.anchorJwtSecret);
    setUserId(saved.userId);
  }

  const needsLogin = ORBIT_URL && (!jwtSecret || !userId || FORCE_LOGIN);

  console.log(`\nZane Anchor`);
  console.log(`  Local:     http://localhost:${server.port}`);
  console.log(`  WebSocket: ws://localhost:${server.port}/ws`);

  if (needsLogin) {
    const ok = await deviceLogin();
    if (!ok) {
      console.log(`  Orbit:     not connected (login required)`);
      console.log();
      return;
    }
  }

  if (ORBIT_URL) {
    const preflight = await preflightOrbitConnection();
    if (!preflight.ok) {
      if (preflight.kind === "auth") {
        console.error(`[anchor] Orbit authentication failed: ${preflight.detail}`);
        console.error("[anchor] Run 'zane login' and then retry 'zane start'.");
        process.exit(1);
      }
      if (preflight.kind === "config") {
        console.error(`[anchor] Orbit configuration failed: ${preflight.detail}`);
        console.error("[anchor] Check ANCHOR_ORBIT_URL/AUTH_URL in your .env.");
        process.exit(1);
      }
      console.warn(`[anchor] Orbit preflight warning: ${preflight.detail}`);
      console.warn("[anchor] Continuing startup; Orbit may reconnect automatically.");
    }

    console.log(`  Orbit:     ${ORBIT_URL}`);
  } else {
    console.log(`  Orbit:     disabled (local-only mode)`);
  }
  console.log();

  void connectOrbit();
}

void startup();
