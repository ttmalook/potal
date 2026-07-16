#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [remediate] DKIM RSA 2048 재발급 조치 --"
dns_reset
openssl genrsa -out /tmp/dk.key 2048 2>/dev/null
PUB=$(openssl rsa -in /tmp/dk.key -pubout -outform DER 2>/dev/null | openssl base64 -A)
dns_add "txt-record=sel._domainkey.example.lab,\"v=DKIM1; k=rsa; p=$PUB\""
dns_reload
show_txt sel._domainkey.example.lab
p=$(txt sel._domainkey.example.lab | tr -d ' "' | sed 's/.*p=//')
bits=$(echo "$p" | openssl base64 -d -A 2>/dev/null | openssl rsa -pubin -inform DER -text -noout 2>/dev/null | grep -o '[0-9]* bit' | head -1)
echo "게시된 DKIM 공개키: $bits"
echo "$bits" | grep -q '2048 bit' || { echo "FAIL: 2048비트 아님 ($bits)"; exit 1; }
assert_dns_ok sel._domainkey.example.lab
echo "PASS(remediate): DKIM 공개키 2048비트(취약 해소) + DNS 정상 -> 이상 없음"
