#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [remediate] CSP unsafe 제거: default-src 'self' 조치 ──"
printf "add_header Content-Security-Policy \"default-src 'self'\" always;\n" > "$SEC_H/csp.conf"
reload_drill
show 'HTTP/|content-security-policy'
assert_header_lacks Content-Security-Policy "unsafe-"
assert_site_ok
echo "PASS(remediate): unsafe 제거(취약 해소) + 사이트 정상 → 웹 이상 없음"
