#!/bin/sh
set -e
. /verify/issues/_lib.sh
echo "── [reproduce] CSP 과도(default-src *) 취약 환경 ──"
reset_drill
printf 'add_header Content-Security-Policy "default-src *" always;\n' > "$SEC_H/csp.conf"
reload_drill
show 'HTTP/|content-security-policy'
assert_header_present Content-Security-Policy
assert_header_contains Content-Security-Policy '*'
echo "PASS(reproduce): CSP 와일드카드(*) → 과도 정책 취약 재현"
