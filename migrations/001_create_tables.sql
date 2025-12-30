PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  action TEXT,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  event TEXT NOT NULL,
  action TEXT,
  repo_full_name TEXT,
  parent_issue_number INTEGER,
  child_issue_number INTEGER,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(delivery_id) REFERENCES deliveries(delivery_id)
);

CREATE TABLE IF NOT EXISTS features (
  feature_key TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  title TEXT,
  md_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_key TEXT NOT NULL,
  task_issue_number INTEGER NOT NULL,
  task_node_id TEXT,
  link_status TEXT NOT NULL DEFAULT 'active',
  updated_at INTEGER NOT NULL,
  UNIQUE(feature_key, task_issue_number),
  FOREIGN KEY(feature_key) REFERENCES features(feature_key)
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  feature_key TEXT,
  task_issue_number INTEGER,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_events_delivery ON webhook_events(delivery_id);
