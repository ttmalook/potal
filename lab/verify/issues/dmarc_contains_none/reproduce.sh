#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] DMARC p=none 취약 환경 --"
dns_reset
dns_add 'txt-record=_dmarc.example.lab,"v=DMARC1; p=none"'
dns_reload
show_txt _dmarc.example.lab
assert_txt_contains _dmarc.example.lab 'p=none'
echo "PASS(reproduce): p=none(모니터링만) -> 위조 차단 안함 취약 재현"
