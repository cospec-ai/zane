import { AUTH_URL, setJwtSecret, setUserId } from "../config";
import { saveCredentials } from "./credentials";

export async function deviceLogin(): Promise<boolean> {
  if (!AUTH_URL) {
    console.error("[anchor] AUTH_URL is required for device login");
    return false;
  }

  console.log("\n  Sign in to connect to Orbit:\n");

  try {
    const codeRes = await fetch(`${AUTH_URL}/auth/device/code`, { method: "POST" });
    if (!codeRes.ok) {
      console.error("[anchor] failed to request device code");
      return false;
    }

    const codeData = (await codeRes.json()) as {
      deviceCode: string;
      userCode: string;
      verificationUrl: string;
      expiresIn: number;
      interval: number;
    };

    console.log(`    ${codeData.verificationUrl}\n`);
    console.log(`  Enter code: \x1b[1m${codeData.userCode}\x1b[0m\n`);

    try {
      Bun.spawn(["open", codeData.verificationUrl]);
    } catch {
      // Ignore — user can open manually
    }

    console.log("  Waiting for authorisation...");

    const deadline = Date.now() + codeData.expiresIn * 1000;
    const interval = codeData.interval * 1000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));

      const tokenRes = await fetch(`${AUTH_URL}/auth/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: codeData.deviceCode }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text().catch(() => "");
        console.error(`  [anchor] poll error (${tokenRes.status}): ${errBody}`);
        continue;
      }

      const tokenData = (await tokenRes.json()) as {
        status: "pending" | "authorised" | "expired";
        userId?: string;
        anchorJwtSecret?: string;
      };

      if (tokenData.status === "pending") continue;

      if (tokenData.status === "authorised" && tokenData.userId && tokenData.anchorJwtSecret) {
        setJwtSecret(tokenData.anchorJwtSecret);
        setUserId(tokenData.userId);

        await saveCredentials({ anchorJwtSecret: tokenData.anchorJwtSecret, userId: tokenData.userId });

        console.log("  \x1b[32mAuthorised!\x1b[0m Credentials saved.\n");
        return true;
      }

      // expired
      console.error("  Code expired. Run 'zane login' to try again.");
      return false;
    }

    console.error("  Timed out. Run 'zane login' to try again.");
    return false;
  } catch (err) {
    console.error("[anchor] device login failed", err);
    return false;
  }
}
