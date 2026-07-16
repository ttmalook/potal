#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [remediate] DKIM h=sha256 조치 --"
dns_reset
openssl genrsa -out /tmp/dk.key 2048 2>/dev/null
PUB=$(openssl rsa -in /tmp/dk.key -pubout -outform DER 2>/dev/null | openssl base64 -A)
dns_add "txt-record=sel._domainkey.example.lab,\"v=DKIM1; k=rsa; h=sha256; p=$PUB\""
dns_reload
show_txt sel._domainkey.example.lab
assert_txt_contains sel._domainkey.example.lab 'h=sha256'
assert_txt_lacks sel._domainkey.example.lab 'h=sha1'
assert_dns_ok sel._domainkey.example.lab
echo "PASS(remediate): DKIM h=sha256(취약 해소) + DNS 정상 -> 이상 없음"
