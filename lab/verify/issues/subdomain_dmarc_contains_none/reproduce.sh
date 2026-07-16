#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] 하위도메인 DMARC p=none 취약 환경 --"
dns_reset
dns_add 'txt-record=_dmarc.sub.example.lab,"v=DMARC1; p=none"'
dns_reload
show_txt _dmarc.sub.example.lab
assert_txt_contains _dmarc.sub.example.lab 'p=none'
echo "PASS(reproduce): 하위도메인 p=none -> 하위 위조 차단 안함 취약 재현"
