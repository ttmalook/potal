#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] CSP 미설정 취약 환경(헤더 누락) ──"
reset_drill; reload_drill
show 'HTTP/|content-security-policy'
assert_header_absent Content-Security-Policy
echo "PASS(reproduce): CSP 없음 → 콘텐츠 주입 취약 재현"
