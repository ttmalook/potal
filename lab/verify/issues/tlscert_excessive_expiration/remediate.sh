#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [remediate] 유효기간 1년(365일) 재발급 조치 --"
good_cert
reload_tls
openssl x509 -in "$CERTS/server.crt" -noout -enddate
if openssl x509 -in "$CERTS/server.crt" -checkend 34387200 -noout >/dev/null 2>&1; then echo "FAIL: 여전히 398일 초과"; exit 1; fi
assert_tls_site_ok
echo "PASS(remediate): 유효기간 <=398일(취약 해소) + 사이트 200 -> 웹 이상 없음"
