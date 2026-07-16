#!/bin/sh
# =====================================================================
# 수동 검증 러너 (사람이 실행) — 자동화(collector)와 독립적으로, 실제 운영자 조치를 재현.
#
#  각 이슈에 대해:
#    reproduce.sh  →  취약점 환경을 실제로 생성하고 취약함을 확인
#    remediate.sh  →  실제 조치를 적용하고  ① 취약 해소  ② 웹 서비스 무해  를 확인
#  둘 다 PASS 여야 그 이슈 검증 성공.
#
#  사용:
#    sh verify.sh <issue_type>     # 특정 이슈만
#    sh verify.sh --all            # verify/issues/* 전부
#
#  전제:  cd claude/lab && docker compose up -d   (drill 타깃이 떠 있어야 함)
# =====================================================================
set -e
# Windows Git-bash(MSYS)에서 컨테이너 절대경로(/verify/...)가 윈도 경로로 변환되는 것 방지(타 OS는 무시됨)
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"   # → claude/lab (compose 파일 위치)

VDIR=verify/issues

# meta.json 의 target(가변 drill 컨테이너) 추출. 없으면 lab-http-drill.
target_of() { sed -n 's/.*"target"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1/meta.json" 2>/dev/null | head -1; }

run_one() {
  it="$1"
  d="$VDIR/$it"
  if [ ! -d "$d" ]; then echo "✗ 알 수 없는 이슈: $it"; return 2; fi
  SVC=$(target_of "$d"); [ -n "$SVC" ] || SVC=lab-http-drill
  echo "==================================================================="
  echo "▶ 이슈 검증: $it   (타깃: $SVC)"
  echo "==================================================================="
  if docker compose exec -T "$SVC" sh "/$d/reproduce.sh" \
     && docker compose exec -T "$SVC" sh "/$d/remediate.sh"; then
    echo "✅ PASS · $it  (취약 재현 → 조치 → 해소·웹 무해 확인)"
    return 0
  else
    echo "❌ FAIL · $it"
    return 1
  fi
}

if [ -z "$1" ] || [ "$1" = "--all" ]; then
  rc=0; pass=0; fail=0
  for dir in "$VDIR"/*/; do
    [ -d "$dir" ] || continue
    it=$(basename "$dir")
    if run_one "$it"; then pass=$((pass+1)); else fail=$((fail+1)); rc=1; fi
    echo ""
  done
  echo "── 요약: PASS $pass · FAIL $fail ──"
  exit $rc
fi

run_one "$1"
