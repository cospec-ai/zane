PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  action TEXT,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  event TEXT NOT NULL,
  action TEXT,
  repo_full_name TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(delivery_id) REFERENCES deliveries(delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_events_delivery ON webhook_events(delivery_id);
