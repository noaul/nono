#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: migrate-nomoney-data.sh [--replace] SOURCE_DB TARGET_DIR

Copies a consistent SQLite snapshot to TARGET_DIR/app.db. Re-running the
command is a no-op when source and target are logically identical. A different
target is never overwritten unless --replace is explicitly supplied.
EOF
}

replace=false
if [[ "${1:-}" == "--replace" ]]; then
  replace=true
  shift
fi

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 2
fi

source_db=$1
target_dir=$2

for command_name in sqlite3 sha256sum flock readlink; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 2
  fi
done

if [[ ! -f "$source_db" ]]; then
  echo "Source database does not exist: $source_db" >&2
  exit 2
fi

source_db=$(readlink -f "$source_db")
mkdir -p "$target_dir"
target_dir=$(readlink -f "$target_dir")
target_db="$target_dir/app.db"
lock_file="$target_dir/.nomoney-migration.lock"

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another NoMoney migration is already running." >&2
  exit 4
fi

integrity_check() {
  sqlite3 -cmd '.timeout 10000' "$1" 'PRAGMA integrity_check;'
}

logical_hash() {
  sqlite3 -cmd '.timeout 10000' "$1" '.dump' | LC_ALL=C sha256sum | awk '{print $1}'
}

print_counts() {
  local db=$1
  local table
  for table in users settings phones vps domains subscriptions expenses reminder_logs; do
    if sqlite3 "$db" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$table';" | grep -qx 1; then
      printf '%s=%s\n' "$table" "$(sqlite3 "$db" "SELECT COUNT(*) FROM \"$table\";")"
    fi
  done
}

source_integrity=$(integrity_check "$source_db")
if [[ "$source_integrity" != "ok" ]]; then
  echo "Source database failed PRAGMA integrity_check: $source_integrity" >&2
  exit 5
fi

source_hash=$(logical_hash "$source_db")

if [[ -f "$target_db" ]]; then
  target_integrity=$(integrity_check "$target_db")
  if [[ "$target_integrity" != "ok" ]]; then
    echo "Target database failed PRAGMA integrity_check: $target_integrity" >&2
    exit 5
  fi

  target_hash=$(logical_hash "$target_db")
  if [[ "$target_hash" == "$source_hash" ]]; then
    echo "Target already matches source; migration skipped."
    echo "logical_hash=$target_hash"
    print_counts "$target_db"
    exit 0
  fi

  if [[ "$replace" != true ]]; then
    echo "Refusing to overwrite a different target database: $target_db" >&2
    echo "Re-run with --replace after verifying backups." >&2
    exit 3
  fi

  target_backup="$target_dir/app.db.pre-migration-$(date +%Y%m%d-%H%M%S)"
  cp -a "$target_db" "$target_backup"
  chmod 600 "$target_backup"
  echo "Existing target backed up to $target_backup"
fi

temp_db="$target_dir/.app.db.migrate.$$"
trap 'rm -f "$temp_db"' EXIT
escaped_temp_db=${temp_db//\'/\'\'}
sqlite3 -cmd '.timeout 10000' "$source_db" "VACUUM INTO '$escaped_temp_db';"

temp_integrity=$(integrity_check "$temp_db")
if [[ "$temp_integrity" != "ok" ]]; then
  echo "Migrated snapshot failed PRAGMA integrity_check: $temp_integrity" >&2
  exit 5
fi

temp_hash=$(logical_hash "$temp_db")
if [[ "$temp_hash" != "$source_hash" ]]; then
  echo "Migrated snapshot does not logically match the source database." >&2
  exit 5
fi

chmod 600 "$temp_db"
mv -f "$temp_db" "$target_db"
trap - EXIT

echo "NoMoney data migration completed: $target_db"
echo "logical_hash=$temp_hash"
print_counts "$target_db"
