#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [reproduce] 자가서명 인증서 취약 환경 --"
reset_tls
good_cert
reload_tls
iss=$(openssl x509 -in "$CERTS/server.crt" -noout -issuer | sed 's/^issuer=//')
sub=$(openssl x509 -in "$CERTS/server.crt" -noout -subject | sed 's/^subject=//')
echo "issuer=$iss / subject=$sub"
[ "$iss" = "$sub" ] || { echo "FAIL: 자가서명 아님"; exit 1; }
echo "PASS(reproduce): issuer==subject -> 자가서명 취약 재현"
