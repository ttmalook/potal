#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [remediate] X-Content-Type-Options: nosniff 조치 ──"
printf 'add_header X-Content-Type-Options "nosniff" always;\n' > "$SEC_H/x-content-type-options.conf"
reload_drill
show 'HTTP/|content-type|x-content-type-options'
assert_header_contains X-Content-Type-Options nosniff
assert_site_ok
echo "PASS(remediate): nosniff 적용(취약 해소) + 사이트 정상 → 웹 이상 없음"
