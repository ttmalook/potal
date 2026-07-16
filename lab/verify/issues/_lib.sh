# =====================================================================
# _lib.sh — 수동 검증 공통 헬퍼 (drill 컨테이너 안에서 각 reproduce/remediate.sh 가 source)
#  실제 명령(curl)으로 관측하고 assert. 실패 시 즉시 exit 1.
# =====================================================================
SEC_H=/etc/nginx/sec/headers    # 서버 레벨 헤더
SEC_R=/etc/nginx/sec/root       # location 레벨(리다이렉트 등)
URL=http://localhost/

# 깨끗한 베이스라인 — 모든 주입 설정 제거(이슈 간 격리·멱등 보장)
reset_drill() { rm -f "$SEC_H"/*.conf "$SEC_R"/*.conf 2>/dev/null || true; }

# 문법 검증 후 reload(잘못된 조치가 서비스를 죽이지 않도록 — 운영자도 하는 절차)
reload_drill() { nginx -t && nginx -s reload && sleep 0.4; }

# 현재 응답 헤더 출력(사람이 눈으로 확인)
show() { echo "\$ curl -sSI $URL"; curl -sSI "$URL" | grep -iE "${1:-.}" || true; echo ""; }

_hdr() { curl -sSI "$URL"; }

# 헤더 존재/부재
assert_header_absent()  { if _hdr | grep -qi "^$1:"; then echo "FAIL: '$1' 존재 — 취약 상태 아님"; exit 1; fi; }
assert_header_present() { if ! _hdr | grep -qi "^$1:"; then echo "FAIL: '$1' 없음"; exit 1; fi; }

# 특정 헤더 값에 부분문자열 포함/불포함 (고정문자열)
assert_header_contains() { _hdr | grep -i "^$1:" | grep -qiF -- "$2" || { echo "FAIL: '$1' 에 '$2' 없음"; exit 1; }; }
assert_header_lacks()    { if _hdr | grep -i "^$1:" | grep -qiF -- "$2"; then echo "FAIL: '$1' 에 '$2' 존재 — 취약"; exit 1; fi; }

# Set-Cookie 속성 유무
_cookie() { _hdr | grep -i '^set-cookie:'; }
assert_cookie_present() { [ -n "$(_cookie)" ] || { echo "FAIL: Set-Cookie 없음"; exit 1; }; }
assert_cookie_has()     { assert_cookie_present; echo "$(_cookie)" | grep -qiF -- "$1" || { echo "FAIL: Set-Cookie 에 '$1' 없음"; exit 1; }; }
assert_cookie_lacks()   { assert_cookie_present; if echo "$(_cookie)" | grep -qiF -- "$1"; then echo "FAIL: Set-Cookie 에 '$1' 존재 — 취약"; exit 1; fi; }

# 리다이렉트: 상태코드 + Location 스킴
assert_redirect() {  # $1=상태(301/302) $2=스킴(http:// | https://)
  h=$(_hdr)
  echo "$h" | grep -qiE "^HTTP/[0-9.]+ $1" || { echo "FAIL: 상태코드 $1 아님"; exit 1; }
  echo "$h" | grep -i '^location:' | grep -qiF -- "$2" || { echo "FAIL: Location 이 '$2' 아님"; exit 1; }
}

# 서비스 무해(웹 정상) — 조치 후 사이트가 200 + 본문 정상인가
assert_site_ok() {
  code=$(curl -s -o /tmp/drill_body -w '%{http_code}' "$URL")
  [ "$code" = "200" ] || { echo "FAIL: 사이트 비정상(HTTP $code) — 조치가 서비스를 손상"; exit 1; }
  grep -qi 'Lab Drill Site' /tmp/drill_body || { echo "FAIL: 본문 비정상 — 조치가 콘텐츠를 손상"; exit 1; }
}
