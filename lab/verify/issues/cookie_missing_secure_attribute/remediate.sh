#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [remediate] 쿠키 Secure 조치 ──"
printf 'add_header Set-Cookie "SID=lab-session-123; Path=/; HttpOnly; Secure" always;\n' > "$SEC_H/cookie.conf"
reload_drill
show 'HTTP/|set-cookie'
assert_cookie_has Secure
assert_site_ok
echo "PASS(remediate): Secure 적용(취약 해소) + 사이트 정상 → 웹 이상 없음"
