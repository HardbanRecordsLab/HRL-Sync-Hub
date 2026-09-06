#!/usr/bin/env bash
# HRL Sync — daily backup of the MinIO object store (+ bundled Postgres if used).
#
#   30 3 * * *  /srv/hrl-sync/scripts/backup.sh >> /var/log/hrl-sync-backup.log 2>&1
#
# NOTE: with a shared/external Postgres, the DB is expected to be covered by that
# server's own backup job — this script only dumps the *bundled* db service.
#
# Restore MinIO:
#   docker compose stop minio
#   docker run --rm -v hrl-sync_hrl_minio:/data -v "$PWD":/b alpine \
#     sh -c 'rm -rf /data/* && tar xzf /b/minio-<ts>.tar.gz -C /data'
#   docker compose start minio
set -euo pipefail

STACK_DIR="${STACK_DIR:-/srv/hrl-sync}"
DEST="${BACKUP_DIR:-/srv/backups/hrl-sync}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"
MINIO_VOL="${MINIO_VOL:-hrl-sync_hrl_minio}"

cd "$STACK_DIR"
mkdir -p "$DEST"

# ── Bundled Postgres (skipped when using a shared/external DB) ──────────────
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  docker compose exec -T db pg_dump -U hrlsync -Fc hrlsync > "$DEST/hrlsync-$TS.dump"
  echo "$(date -Is) OK  db     $(du -h "$DEST/hrlsync-$TS.dump" | cut -f1)"
else
  echo "$(date -Is) --  db     external — covered by the DB server's own backup"
fi

# ── MinIO — snapshot the data volume (objects + metadata) ──────────────────
docker run --rm -v "${MINIO_VOL}:/data:ro" -v "$DEST:/backup" alpine \
  tar czf "/backup/minio-$TS.tar.gz" -C /data .
echo "$(date -Is) OK  minio  $(du -h "$DEST/minio-$TS.tar.gz" | cut -f1)"

# ── Retention ─────────────────────────────────────────────────────────────
find "$DEST" -maxdepth 1 -name 'hrlsync-*.dump' -mtime +"$RETENTION_DAYS" -delete
find "$DEST" -maxdepth 1 -name 'minio-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
echo "$(date -Is) done; kept ${RETENTION_DAYS}d ($(ls -1 "$DEST" 2>/dev/null | wc -l) files, $(du -sh "$DEST" | cut -f1))"
