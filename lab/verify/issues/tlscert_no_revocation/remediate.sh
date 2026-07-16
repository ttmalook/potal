#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [remediate] CRL Distribution Points 추가 재발급 조치 --"
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout "$CERTS/server.key" -out "$CERTS/server.crt" -subj "/CN=lab-tls-drill" -addext "crlDistributionPoints=URI:http://lab-tls-drill/crl.pem" 2>/dev/null
reload_tls
openssl x509 -in "$CERTS/server.crt" -noout -text | grep -A1 'CRL Distribution Points' | head -2
cert_has 'CRL Distribution Points' || { echo "FAIL: CRL DP 미포함"; exit 1; }
assert_tls_site_ok
echo "PASS(remediate): CRL DP 포함(취약 해소) + 사이트 200 -> 웹 이상 없음"
