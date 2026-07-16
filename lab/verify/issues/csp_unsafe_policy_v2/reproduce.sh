#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] CSP unsafe(unsafe-inline/eval) 취약 환경 ──"
reset_drill
printf "add_header Content-Security-Policy \"default-src 'self' 'unsafe-inline' 'unsafe-eval'\" always;\n" > "$SEC_H/csp.conf"
reload_drill
show 'HTTP/|content-security-policy'
assert_header_contains Content-Security-Policy "unsafe-inline"
echo "PASS(reproduce): unsafe-inline 포함 → 취약 정책 재현"
