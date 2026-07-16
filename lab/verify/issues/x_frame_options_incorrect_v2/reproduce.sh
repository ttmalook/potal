#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] X-Frame-Options 취약 환경(헤더 누락) ──"
reset_drill; reload_drill
show 'HTTP/|x-frame-options'
assert_header_absent X-Frame-Options
echo "PASS(reproduce): X-Frame-Options 없음 → 클릭재킹 취약 재현"
