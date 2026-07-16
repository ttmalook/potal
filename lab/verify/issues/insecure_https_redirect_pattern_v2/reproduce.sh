#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] 안전하지 않은 리다이렉트(http 302) 취약 환경 ──"
reset_drill
printf 'return 302 http://insecure.example/;\n' > "$SEC_R/redirect.conf"
reload_drill
show 'HTTP/|location'
assert_redirect 302 'http://'
echo "PASS(reproduce): 302 → http:// 리다이렉트 → 다운그레이드 취약 재현"
