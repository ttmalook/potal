#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] DMARC 미설정 취약 환경 --"
dns_reset; dns_reload
show_txt _dmarc.example.lab
assert_txt_absent _dmarc.example.lab
echo "PASS(reproduce): _dmarc TXT 없음 -> 정책 부재 취약 재현"
