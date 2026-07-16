#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [reproduce] 만료된 인증서 취약 환경 --"
reset_tls
openssl req -newkey rsa:2048 -nodes -keyout "$CERTS/server.key" -out /tmp/s.csr -subj "/CN=lab-tls-drill" 2>/dev/null
openssl x509 -req -in /tmp/s.csr -signkey "$CERTS/server.key" -sha256 -days -1 -out "$CERTS/server.crt" 2>/dev/null
reload_tls
echo "\$ openssl x509 -noout -dates"; cert_dates
if openssl x509 -in "$CERTS/server.crt" -checkend 0 -noout >/dev/null 2>&1; then echo "FAIL: 미만료(취약 아님)"; exit 1; fi
echo "PASS(reproduce): 인증서 만료됨(notAfter 과거) -> 취약 재현"
