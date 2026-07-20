#!/bin/sh
# =====================================================================
# VM-LAB 증적 아티팩트 백업 — labartifacts 볼륨 → tar.gz
#   증적 이미지(조치 전·후 캡처)는 재생성이 가능하지만, 이미 고객에게 전달된
#   증적은 그 시점 기록이므로 백업 대상이다.
#
#   사용:  sh lab-artifacts-backup.sh
#   cron 예시(매일 03:10):
#     10 3 * * * /home/ssclab/portal/deploy/backup/lab-artifacts-backup.sh >> /var/log/ssc-backup.log 2>&1
# =====================================================================
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backup/ssc}"
KEEP_DAYS="${KEEP_DAYS:-14}"
VOLUME="${ARTIFACT_VOLUME:-lab_labartifacts}"

if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "[backup] ERROR: 볼륨 '$VOLUME' 을 찾을 수 없습니다."
  echo "          확인: docker volume ls | grep artifact"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d)
NAME="artifacts_${TS}.tar.gz"

# 볼륨을 읽기전용으로 마운트해 tar (실행 중 컨테이너 정지 불필요)
docker run --rm \
  -v "$VOLUME":/src:ro \
  -v "$BACKUP_DIR":/dst \
  alpine:3.20 tar czf "/dst/${NAME}.tmp" -C /src .

SIZE=$(wc -c < "$BACKUP_DIR/${NAME}.tmp" | tr -d ' ')
if [ "$SIZE" -lt 500 ]; then
  echo "[backup] ERROR: 아카이브가 비정상입니다(${SIZE} bytes) — 폐기"
  rm -f "$BACKUP_DIR/${NAME}.tmp"
  exit 1
fi

mv "$BACKUP_DIR/${NAME}.tmp" "$BACKUP_DIR/${NAME}"
echo "[backup] OK  $BACKUP_DIR/${NAME}  ($((SIZE / 1024)) KB)"

DELETED=$(find "$BACKUP_DIR" -name 'artifacts_*.tar.gz' -mtime +"$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')
echo "[backup] 보관 ${KEEP_DAYS}일 초과 ${DELETED}건 정리"
