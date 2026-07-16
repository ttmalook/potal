#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [remediate] 내부 CA 서명 인증서 교체 조치 --"
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout /tmp/ca.key -out /tmp/ca.crt -subj "/CN=Lab Internal CA" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout "$CERTS/server.key" -out /tmp/s.csr -subj "/CN=lab-tls-drill" 2>/dev/null
openssl x509 -req -in /tmp/s.csr -CA /tmp/ca.crt -CAkey /tmp/ca.key -CAcreateserial -sha256 -days 365 -out "$CERTS/server.crt" 2>/dev/null
reload_tls
openssl verify -CAfile /tmp/ca.crt "$CERTS/server.crt" >/dev/null 2>&1 || { echo "FAIL: CA 검증 실패"; exit 1; }
iss=$(openssl x509 -in "$CERTS/server.crt" -noout -issuer | sed 's/^issuer=//')
sub=$(openssl x509 -in "$CERTS/server.crt" -noout -subject | sed 's/^subject=//')
[ "$iss" != "$sub" ] || { echo "FAIL: 여전히 자가서명"; exit 1; }
assert_tls_site_ok
echo "PASS(remediate): CA 서명(issuer!=subject, verify OK) + 사이트 200 -> 웹 이상 없음"
