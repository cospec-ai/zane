import { Database } from "bun:sqlite";

export const db = new Database("data/db.sqlite");

export function upsertDelivery(
  deliveryId: string,
  event: string,
  action?: string | null
) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO deliveries(delivery_id, event, action, received_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(deliveryId, event, action ?? null, Date.now());
}

export function upsertWebhookEvent(params: {
  deliveryId: string;
  event: string;
  action?: string | null;
  repoFullName?: string | null;
  payloadJson?: string | null;
}) {
  return db
    .prepare(
      `INSERT INTO webhook_events(
        delivery_id, event, action, repo_full_name,
        payload_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.deliveryId,
      params.event,
      params.action ?? null,
      params.repoFullName ?? null,
      params.payloadJson ?? null,
      Date.now()
    );
}
