#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [remediate] HSTS 조치 ──"
printf 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n' > "$SEC_H/hsts.conf"
reload_drill
show 'HTTP/|strict-transport-security'
assert_header_contains Strict-Transport-Security max-age=31536000
assert_site_ok
echo "PASS(remediate): HSTS 적용(취약 해소) + 사이트 정상 → 웹 이상 없음"
