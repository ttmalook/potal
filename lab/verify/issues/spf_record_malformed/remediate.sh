#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [remediate] 유효한 SPF 재작성 조치 --"
dns_reset
dns_add 'txt-record=example.lab,"v=spf1 ip4:192.0.2.0/24 -all"'
dns_reload
show_txt example.lab
assert_txt_contains example.lab 'ip4:192.0.2.0/24'
assert_txt_lacks example.lab '300.1.1.1'
assert_dns_ok example.lab
echo "PASS(remediate): 유효 SPF(취약 해소) + DNS 정상 -> 이상 없음"
