#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [remediate] X-Frame-Options: SAMEORIGIN 조치 ──"
printf 'add_header X-Frame-Options "SAMEORIGIN" always;\n' > "$SEC_H/x-frame-options.conf"
reload_drill
show 'HTTP/|x-frame-options'
assert_header_contains X-Frame-Options SAMEORIGIN
assert_site_ok
echo "PASS(remediate): SAMEORIGIN 적용(취약 해소) + 사이트 정상 → 웹 이상 없음"
