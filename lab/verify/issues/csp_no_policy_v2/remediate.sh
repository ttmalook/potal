#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [remediate] CSP: default-src 'self' 조치 ──"
printf "add_header Content-Security-Policy \"default-src 'self'\" always;\n" > "$SEC_H/csp.conf"
reload_drill
show 'HTTP/|content-security-policy'
assert_header_contains Content-Security-Policy "default-src 'self'"
assert_site_ok
echo "PASS(remediate): CSP 적용(취약 해소) + 사이트 정상 → 웹 이상 없음"
