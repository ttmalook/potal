#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [remediate] DMARC(p=reject) 게시 조치 --"
dns_add 'txt-record=_dmarc.example.lab,"v=DMARC1; p=reject; rua=mailto:dmarc@example.lab"'
dns_reload
show_txt _dmarc.example.lab
assert_txt_contains _dmarc.example.lab 'v=DMARC1'
assert_txt_contains _dmarc.example.lab 'p=reject'
assert_dns_ok _dmarc.example.lab
echo "PASS(remediate): DMARC p=reject 게시(취약 해소) + DNS 정상 -> 이상 없음"
