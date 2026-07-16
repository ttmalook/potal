#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [remediate] X-XSS-Protection: 1; mode=block 조치 ──"
printf 'add_header X-XSS-Protection "1; mode=block" always;\n' > "$SEC_H/x-xss-protection.conf"
reload_drill
show 'HTTP/|x-xss-protection'
assert_header_contains X-XSS-Protection "mode=block"
assert_site_ok
echo "PASS(remediate): 1; mode=block 적용(취약 해소) + 사이트 정상 → 웹 이상 없음"
