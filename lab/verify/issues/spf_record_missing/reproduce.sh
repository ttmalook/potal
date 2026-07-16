#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] SPF 미설정 취약 환경 --"
dns_reset; dns_reload
show_txt example.lab
assert_txt_absent example.lab
echo "PASS(reproduce): SPF TXT 없음 -> 발신자 위조 취약 재현"
