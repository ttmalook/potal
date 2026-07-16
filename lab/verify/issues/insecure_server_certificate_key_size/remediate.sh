#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [remediate] RSA 2048 재발급 조치 --"
reset_tls   # seclevel 하향(취약 설정) 제거 → 기본 seclevel 복귀
good_cert
reload_tls
openssl x509 -in "$CERTS/server.crt" -noout -text | grep -i 'Public-Key'
cert_has '2048 bit' || { echo "FAIL: 2048비트 아님"; exit 1; }
assert_tls_site_ok
echo "PASS(remediate): RSA 2048비트(취약 해소) + 사이트 200 -> 웹 이상 없음"
