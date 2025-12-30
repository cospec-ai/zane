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

export function upsertFeature(
  featureKey: string,
  repoFullName: string,
  issueNumber: number,
  title: string | null,
  mdPath: string
) {
  return db
    .prepare(
      `INSERT INTO features(feature_key, repo_full_name, issue_number, title, md_path, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(feature_key) DO UPDATE SET
       title=excluded.title,
       md_path=excluded.md_path,
       updated_at=excluded.updated_at`
    )
    .run(featureKey, repoFullName, issueNumber, title, mdPath, Date.now());
}

export function upsertFeatureTask(
  featureKey: string,
  taskIssueNumber: number,
  linkStatus: "active" | "removed"
) {
  return db
    .prepare(
      `INSERT INTO feature_tasks(feature_key, task_issue_number, link_status, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(feature_key, task_issue_number) DO UPDATE SET
       link_status=excluded.link_status,
       updated_at=excluded.updated_at`
    )
    .run(featureKey, taskIssueNumber, linkStatus, Date.now());
}
