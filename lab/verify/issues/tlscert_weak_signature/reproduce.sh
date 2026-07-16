#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [reproduce] 약한 서명(SHA-1) 취약 환경 --"
reset_tls
openssl req -x509 -newkey rsa:2048 -sha1 -days 365 -nodes -keyout "$CERTS/server.key" -out "$CERTS/server.crt" -subj "/CN=lab-tls-drill" 2>/dev/null
reload_tls
openssl x509 -in "$CERTS/server.crt" -noout -text | grep -i 'Signature Algorithm' | head -1
cert_has 'sha1' || { echo "FAIL: SHA-1 아님"; exit 1; }
echo "PASS(reproduce): sha1WithRSAEncryption -> 약한 서명 취약 재현"
