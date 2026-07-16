#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [remediate] 유효 인증서(365일) 교체 조치 --"
good_cert
reload_tls
echo "\$ openssl x509 -noout -dates"; cert_dates
openssl x509 -in "$CERTS/server.crt" -checkend 0 -noout >/dev/null 2>&1 || { echo "FAIL: 여전히 만료"; exit 1; }
assert_tls_site_ok
echo "PASS(remediate): 유효 인증서(취약 해소) + 사이트 200 -> 웹 이상 없음"
