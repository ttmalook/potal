#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] X-XSS-Protection 취약 환경(헤더 누락) ──"
reset_drill; reload_drill
show 'HTTP/|x-xss-protection'
assert_header_absent X-XSS-Protection
echo "PASS(reproduce): X-XSS-Protection 없음 → 취약 재현"
