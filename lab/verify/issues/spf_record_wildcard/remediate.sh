#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [remediate] SPF -all 조치 --"
dns_reset
dns_add 'txt-record=example.lab,"v=spf1 -all"'
dns_reload
show_txt example.lab
assert_txt_contains example.lab '-all'
assert_txt_lacks example.lab '+all'
assert_dns_ok example.lab
echo "PASS(remediate): -all(취약 해소) + DNS 정상 -> 이상 없음"
