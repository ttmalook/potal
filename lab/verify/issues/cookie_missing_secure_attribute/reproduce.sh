#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] 쿠키 Secure 누락 취약 환경 ──"
reset_drill
printf 'add_header Set-Cookie "SID=lab-session-123; Path=/; HttpOnly" always;\n' > "$SEC_H/cookie.conf"
reload_drill
show 'HTTP/|set-cookie'
assert_cookie_lacks Secure
echo "PASS(reproduce): Set-Cookie 에 Secure 없음 → 평문 전송 취약 재현"
