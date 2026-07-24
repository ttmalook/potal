#!/bin/sh
# =====================================================================
# VM-DB 복구 — 백업 파일에서 DB 복원
#
#   주의: 기존 데이터를 덮어씁니다. 반드시 확인 후 실행하세요.
#   사용:  sh restore-db.sh /backup/ssc/ssc_20260720_1700.sql.gz
#
#   RTO 10분 달성을 위해 배포 후 1회 리허설을 권장합니다.
# =====================================================================
set -eu

FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "사용법: $0 <백업파일.sql.gz>"
  echo ""
  echo "사용 가능한 백업:"
  ls -1t "${BACKUP_DIR:-/backup/ssc}"/ssc_*.sql.gz 2>/dev/null | head -10 || echo "  (없음)"
  exit 1
fi
[ -f "$FILE" ] || { echo "[restore] ERROR: 파일 없음 — $FILE"; exit 1; }

DB="${PGDATABASE:-ssc_portal}"
DBUSER="${PGUSER:-ssc}"
CONTAINER="${DB_CONTAINER:-}"
if [ -z "$CONTAINER" ]; then
  CONTAINER=$(docker ps --filter "ancestor=postgres:16-alpine" --format '{{.Names}}' | head -1)
fi
[ -n "$CONTAINER" ] || { echo "[restore] ERROR: db 컨테이너를 찾을 수 없습니다."; exit 1; }

echo "복구 대상 : $FILE"
echo "대상 DB   : $DB (컨테이너 $CONTAINER)"
echo ""
printf "주의:  기존 데이터가 모두 대체됩니다. 계속하려면 'RESTORE' 를 입력하세요: "
read -r ANS
[ "$ANS" = "RESTORE" ] || { echo "[restore] 취소됨"; exit 1; }

# 안전장치: 복구 직전 현재 상태를 먼저 덤프해 둔다(되돌릴 수 있게).
PRE="${BACKUP_DIR:-/backup/ssc}/pre-restore_$(date +%Y%m%d_%H%M).sql.gz"
mkdir -p "$(dirname "$PRE")"
docker exec "$CONTAINER" pg_dump -U "$DBUSER" -d "$DB" | gzip > "$PRE" || true
echo "[restore] 복구 전 스냅샷 저장: $PRE"

# 기존 스키마 제거 후 재생성 → 덤프 적용
docker exec -i "$CONTAINER" psql -U "$DBUSER" -d "$DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U "$DBUSER" -d "$DB"

echo "[restore] 완료 — 백엔드를 재시작하세요:"
echo "  (VM-APP) cd ~/portal/deploy && sudo docker compose -f docker-compose.app.yml restart backend"
