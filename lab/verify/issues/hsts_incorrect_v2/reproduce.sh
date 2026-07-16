#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] HSTS 취약 환경(헤더 누락) ──"
reset_drill; reload_drill
show 'HTTP/|strict-transport-security'
assert_header_absent Strict-Transport-Security
echo "PASS(reproduce): HSTS 없음 → HTTPS 강제 미흡 취약 재현"
