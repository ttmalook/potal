#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] SPF +all(전체 허용) 취약 환경 --"
dns_reset
dns_add 'txt-record=example.lab,"v=spf1 +all"'
dns_reload
show_txt example.lab
assert_txt_contains example.lab '+all'
echo "PASS(reproduce): +all(모든 발신 허용) -> 위조 무력화 취약 재현"
