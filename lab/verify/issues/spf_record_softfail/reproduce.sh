#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] SPF softfail(~all) 취약 환경 --"
dns_reset
dns_add 'txt-record=example.lab,"v=spf1 ~all"'
dns_reload
show_txt example.lab
assert_txt_contains example.lab '~all'
echo "PASS(reproduce): ~all(softfail) -> 위조 메일 완화 미흡 취약 재현"
