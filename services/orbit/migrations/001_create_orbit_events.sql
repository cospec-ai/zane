CREATE TABLE IF NOT EXISTS orbit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  direction TEXT NOT NULL,
  role TEXT NOT NULL,
  method TEXT,
  turn_id TEXT,
  entry_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orbit_events_thread_id ON orbit_events(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_orbit_events_method ON orbit_events(method);
