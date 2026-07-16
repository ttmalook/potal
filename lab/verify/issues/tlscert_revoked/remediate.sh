#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [remediate] 신규(비폐지) 인증서 재발급 조치 --"
CA=/tmp/ca
[ -f "$CA/ca.cnf" ] || { echo "FAIL: CA 없음(먼저 reproduce 필요)"; exit 1; }
openssl req -newkey rsa:2048 -nodes -keyout "$CERTS/server.key" -out "$CA/s2.csr" -subj "/CN=lab-tls-drill" 2>/dev/null
openssl ca -batch -config "$CA/ca.cnf" -in "$CA/s2.csr" -out "$CERTS/server.crt" 2>/dev/null
openssl ca -batch -config "$CA/ca.cnf" -gencrl -out "$CA/crl.pem" 2>/dev/null
reload_tls
echo "\$ openssl verify -crl_check -CAfile ca.crt -CRLfile crl.pem server.crt"
openssl verify -crl_check -CAfile "$CA/ca.crt" -CRLfile "$CA/crl.pem" "$CERTS/server.crt" 2>&1 | head -1
openssl verify -crl_check -CAfile "$CA/ca.crt" -CRLfile "$CA/crl.pem" "$CERTS/server.crt" >/dev/null 2>&1 || { echo "FAIL: 신규 인증서도 폐지로 표시"; exit 1; }
assert_tls_site_ok
echo "PASS(remediate): 비폐지 인증서(verify -crl_check OK) + 사이트 200 -> 웹 이상 없음"
