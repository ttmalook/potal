#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [reproduce] 과도한 유효기간(10년) 취약 환경 --"
reset_tls
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout "$CERTS/server.key" -out "$CERTS/server.crt" -subj "/CN=lab-tls-drill" 2>/dev/null
reload_tls
openssl x509 -in "$CERTS/server.crt" -noout -enddate
openssl x509 -in "$CERTS/server.crt" -checkend 34387200 -noout >/dev/null 2>&1 || { echo "FAIL: 398일 내 만료(과도 아님)"; exit 1; }
echo "PASS(reproduce): 398일 초과 유효 -> 과도한 유효기간 취약 재현"
