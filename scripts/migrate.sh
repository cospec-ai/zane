#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
DB_PATH=${PULSE_DB_PATH:-"$ROOT_DIR/data/db.sqlite"}
MIGRATIONS_DIR=${PULSE_MIGRATIONS_DIR:-"$ROOT_DIR/migrations"}

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "[migrate] sqlite3 is required but was not found." >&2
  exit 1
fi

mkdir -p "$(dirname "$DB_PATH")"

shopt -s nullglob
FILES=("$MIGRATIONS_DIR"/*.sql)
if [ ${#FILES[@]} -eq 0 ]; then
  echo "[migrate] No migrations found."
  exit 0
fi

for file in "${FILES[@]}"; do
  sqlite3 "$DB_PATH" < "$file"
  echo "[migrate] Applied $(basename "$file")"
done
