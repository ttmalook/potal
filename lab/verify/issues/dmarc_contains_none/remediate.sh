#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [remediate] DMARC p=reject 조치 --"
dns_reset
dns_add 'txt-record=_dmarc.example.lab,"v=DMARC1; p=reject; rua=mailto:dmarc@example.lab"'
dns_reload
show_txt _dmarc.example.lab
assert_txt_contains _dmarc.example.lab 'p=reject'
assert_txt_lacks _dmarc.example.lab 'p=none'
assert_dns_ok _dmarc.example.lab
echo "PASS(remediate): p=reject(취약 해소) + DNS 정상 -> 이상 없음"
