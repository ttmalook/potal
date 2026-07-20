#!/bin/sh
# =====================================================================
# VM-DB 정기 백업 — pg_dump → gzip → 보관주기 초과분 정리
#
#   사용:  sh db-backup.sh
#   환경변수(선택): BACKUP_DIR(기본 /backup/ssc) · KEEP_DAYS(기본 14)
#                   PGDATABASE · PGUSER · DB_CONTAINER
#
#   cron 예시(매시 정각):
#     0 * * * * /home/sscdb/portal/deploy/backup/db-backup.sh >> /var/log/ssc-backup.log 2>&1
# =====================================================================
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backup/ssc}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB="${PGDATABASE:-ssc_portal}"
DBUSER="${PGUSER:-ssc}"
CONTAINER="${DB_CONTAINER:-}"

# db 컨테이너 자동 탐색(지정 없으면 postgres 이미지 기준)
if [ -z "$CONTAINER" ]; then
  CONTAINER=$(docker ps --filter "ancestor=postgres:16-alpine" --format '{{.Names}}' | head -1)
fi
if [ -z "$CONTAINER" ]; then
  echo "[backup] ERROR: db 컨테이너를 찾을 수 없습니다. DB_CONTAINER 로 지정하세요."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M)
OUT="$BACKUP_DIR/ssc_${TS}.sql.gz"

# 파이프에서는 pg_dump 실패가 gzip 성공에 가려지므로, 아래 크기 검사로 확정한다.
docker exec "$CONTAINER" pg_dump -U "$DBUSER" -d "$DB" | gzip > "$OUT.tmp"

SIZE=$(wc -c < "$OUT.tmp" | tr -d ' ')
if [ "$SIZE" -lt 1000 ]; then
  echo "[backup] ERROR: 덤프가 비정상입니다(${SIZE} bytes) — 백업 폐기"
  rm -f "$OUT.tmp"
  exit 1
fi

mv "$OUT.tmp" "$OUT"
echo "[backup] OK  $OUT  ($((SIZE / 1024)) KB)"

# 보관주기 초과분 정리
DELETED=$(find "$BACKUP_DIR" -name 'ssc_*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')
echo "[backup] 보관 ${KEEP_DAYS}일 초과 ${DELETED}건 정리"
