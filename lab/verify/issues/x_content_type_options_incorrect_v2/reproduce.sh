#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] X-Content-Type-Options 취약 환경(헤더 누락) ──"
reset_drill; reload_drill
show 'HTTP/|content-type|x-content-type-options'
assert_header_absent X-Content-Type-Options
echo "PASS(reproduce): X-Content-Type-Options 없음 → MIME 스니핑 취약 재현"
