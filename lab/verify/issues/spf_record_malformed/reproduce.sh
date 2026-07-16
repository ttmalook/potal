#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] SPF 형식 오류(잘못된 IP) 취약 환경 --"
dns_reset
dns_add 'txt-record=example.lab,"v=spf1 ip4:300.1.1.1 -all"'
dns_reload
show_txt example.lab
assert_txt_contains example.lab '300.1.1.1'
echo "PASS(reproduce): 유효하지 않은 ip4(300.1.1.1) -> 형식 오류 취약 재현"
