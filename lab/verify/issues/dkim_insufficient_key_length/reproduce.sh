#!/bin/sh
set -e
. /verify/issues/_dns_lib.sh
echo "-- [reproduce] DKIM 키 길이 부족(RSA 512) 취약 환경 --"
dns_reset
openssl genrsa -out /tmp/dk.key 512 2>/dev/null
PUB=$(openssl rsa -in /tmp/dk.key -pubout -outform DER 2>/dev/null | openssl base64 -A)
dns_add "txt-record=sel._domainkey.example.lab,\"v=DKIM1; k=rsa; p=$PUB\""
dns_reload
show_txt sel._domainkey.example.lab
# DNS에 게시된 공개키를 다시 추출해 길이 확인(진짜 게시값 검증)
p=$(txt sel._domainkey.example.lab | tr -d ' "' | sed 's/.*p=//')
bits=$(echo "$p" | openssl base64 -d -A 2>/dev/null | openssl rsa -pubin -inform DER -text -noout 2>/dev/null | grep -o '[0-9]* bit' | head -1)
echo "게시된 DKIM 공개키: $bits"
echo "$bits" | grep -q '512 bit' || { echo "FAIL: 512비트 아님 ($bits)"; exit 1; }
echo "PASS(reproduce): DKIM 공개키 512비트 -> 약한 키 취약 재현"
