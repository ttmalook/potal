#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] DKIM 약한 서명(h=sha1) 취약 환경 --"
dns_reset
openssl genrsa -out /tmp/dk.key 1024 2>/dev/null
PUB=$(openssl rsa -in /tmp/dk.key -pubout -outform DER 2>/dev/null | openssl base64 -A)
dns_add "txt-record=sel._domainkey.example.lab,\"v=DKIM1; k=rsa; h=sha1; p=$PUB\""
dns_reload
show_txt sel._domainkey.example.lab
assert_txt_contains sel._domainkey.example.lab 'h=sha1'
echo "PASS(reproduce): DKIM h=sha1 -> 약한 해시 서명 취약 재현"
