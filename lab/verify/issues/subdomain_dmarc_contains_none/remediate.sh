#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [remediate] 하위도메인 DMARC p=reject 조치 --"
dns_reset
dns_add 'txt-record=_dmarc.sub.example.lab,"v=DMARC1; p=reject"'
dns_reload
show_txt _dmarc.sub.example.lab
assert_txt_contains _dmarc.sub.example.lab 'p=reject'
assert_txt_lacks _dmarc.sub.example.lab 'p=none'
assert_dns_ok _dmarc.sub.example.lab
echo "PASS(remediate): 하위도메인 p=reject(취약 해소) + DNS 정상 -> 이상 없음"
