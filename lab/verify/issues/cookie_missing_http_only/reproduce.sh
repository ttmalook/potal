#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] 쿠키 HttpOnly 누락 취약 환경 ──"
reset_drill
printf 'add_header Set-Cookie "SID=lab-session-123; Path=/" always;\n' > "$SEC_H/cookie.conf"
reload_drill
show 'HTTP/|set-cookie'
assert_cookie_lacks HttpOnly
echo "PASS(reproduce): Set-Cookie 에 HttpOnly 없음 → 스크립트 탈취 취약 재현"
