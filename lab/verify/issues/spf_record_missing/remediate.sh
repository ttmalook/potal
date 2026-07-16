#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [remediate] SPF(v=spf1 -all) 게시 조치 --"
dns_add 'txt-record=example.lab,"v=spf1 -all"'
dns_reload
show_txt example.lab
assert_txt_contains example.lab 'v=spf1'
assert_txt_contains example.lab '-all'
assert_dns_ok example.lab
echo "PASS(remediate): SPF 하드페일 게시(취약 해소) + DNS 정상 응답 -> 이상 없음"
