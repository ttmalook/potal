#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [remediate] 안전한 리다이렉트(https 301) 조치 ──"
printf 'return 301 https://$host$request_uri;\n' > "$SEC_R/redirect.conf"
reload_drill
show 'HTTP/|location'
assert_redirect 301 'https://'
echo "PASS(remediate): 301 → https:// 강제(취약 해소) · 리다이렉트 정상 동작 → 웹 이상 없음"
