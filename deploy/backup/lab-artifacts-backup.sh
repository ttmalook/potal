#!/bin/sh
# =====================================================================
# VM-LAB 증적 아티팩트 백업 — 첫 회 전체, 이후 증분(하드링크 스냅샷)
#
#   방식: rsync --link-dest
#     - 직전 스냅샷과 내용이 같은 파일은 "하드링크"로 연결 → 디스크를 추가로 쓰지 않음
#     - 그런데도 각 회차 디렉터리는 완전한 스냅샷처럼 보임 → 복구가 단순(그냥 복사)
#     - 첫 회는 기준 스냅샷이 없으므로 자동으로 전체 복사(= 풀백업)
#
#   증적 이미지는 생성 후 변경되지 않고 누적되기만 하므로 증분 효율이 매우 높다.
#
#   사용:  sh lab-artifacts-backup.sh
#   환경변수(선택): BACKUP_ROOT(기본 /backup/ssc/artifacts) · KEEP_SNAPSHOTS(기본 14)
#
#   cron 예시(매일 03:10):
#     10 3 * * * $HOME/portal/deploy/backup/lab-artifacts-backup.sh >> /var/log/ssc-backup.log 2>&1
# =====================================================================
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backup/ssc/artifacts}"
KEEP="${KEEP_SNAPSHOTS:-14}"
VOLUME="${ARTIFACT_VOLUME:-lab_labartifacts}"

if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "[backup] ERROR: 볼륨 '$VOLUME' 을 찾을 수 없습니다."
  echo "          확인: docker volume ls | grep artifact"
  exit 1
fi

mkdir -p "$BACKUP_ROOT"
STAMP=$(date +%Y%m%d_%H%M)

# 직전 스냅샷 = 가장 최근 날짜 디렉터리. 심볼릭 링크에 의존하지 않는다
# (파일시스템/OS 별 심링크 동작 차이로 깨지는 것을 피하기 위함).
PREV=$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' 2>/dev/null | sort | tail -1)
if [ -n "$PREV" ]; then
  LINKOPT="--link-dest=/dst/$(basename "$PREV")"
  MODE="증분 (기준: $(basename "$PREV"))"
else
  LINKOPT=""
  MODE="전체(첫 회)"
fi

# 작업 중 디렉터리는 '20'으로 시작하지 않게 해서 스냅샷 탐색/정리에 섞이지 않도록 한다
rm -rf "$BACKUP_ROOT/.incoming"
docker run --rm \
  -v "$VOLUME":/src:ro \
  -v "$BACKUP_ROOT":/dst \
  alpine:3.20 sh -c "apk add --no-cache rsync >/dev/null 2>&1 && rsync -a --delete $LINKOPT /src/ /dst/.incoming/"

mv "$BACKUP_ROOT/.incoming" "$BACKUP_ROOT/${STAMP}"

FILES=$(find "$BACKUP_ROOT/$STAMP" -type f | wc -l | tr -d ' ')
SNAP=$(du -sh "$BACKUP_ROOT/$STAMP" 2>/dev/null | cut -f1)
# 하드링크 공유분을 제외한 전체 실사용량(스냅샷 여러 개를 함께 계산해야 정확)
TOTAL=$(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)
SNAPS=$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' | wc -l | tr -d ' ')
echo "[backup] OK  ${MODE}"
echo "[backup]     $BACKUP_ROOT/$STAMP  (파일 ${FILES}개 · 논리 크기 ${SNAP})"
echo "[backup]     보관 스냅샷 ${SNAPS}개 · 전체 실사용 ${TOTAL} (동일 파일은 하드링크로 공유)"

# 보관 개수 초과 스냅샷 정리(오래된 것부터)
COUNT=$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  REMOVE=$((COUNT - KEEP))
  find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' | sort | head -n "$REMOVE" | while read -r d; do
    rm -rf "$d"; echo "[backup]     보관주기 초과 삭제: $(basename "$d")"
  done
fi
