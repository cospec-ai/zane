export interface AuthEnv {
  DB: D1Database;
  PASSKEY_CHALLENGE_DO: DurableObjectNamespace;
  PASSKEY_ORIGIN?: string;
  ZANE_WEB_JWT_SECRET?: string;
  ZANE_ANCHOR_JWT_SECRET?: string;
}
