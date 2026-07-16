#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [remediate] SHA-256 재발급 조치 --"
good_cert
reload_tls
openssl x509 -in "$CERTS/server.crt" -noout -text | grep -i 'Signature Algorithm' | head -1
cert_has 'sha256' || { echo "FAIL: SHA-256 아님"; exit 1; }
if cert_has 'sha1WithRSA'; then echo "FAIL: 여전히 SHA-1"; exit 1; fi
assert_tls_site_ok
echo "PASS(remediate): sha256WithRSAEncryption(취약 해소) + 사이트 200 -> 웹 이상 없음"
