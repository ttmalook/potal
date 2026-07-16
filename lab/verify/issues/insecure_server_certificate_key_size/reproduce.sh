#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [reproduce] 약한 키 크기(RSA 1024) 취약 환경 --"
reset_tls
# OpenSSL 3.0 기본 seclevel 은 1024비트 키를 거부 → 취약 재현 위해 seclevel 낮춤(약한 키를 억지로 쓰는 상황)
echo 'ssl_ciphers ALL:@SECLEVEL=0;' > "$SEC_T/seclevel.conf"
openssl req -x509 -newkey rsa:1024 -sha256 -days 365 -nodes -keyout "$CERTS/server.key" -out "$CERTS/server.crt" -subj "/CN=lab-tls-drill" 2>/dev/null
reload_tls
openssl x509 -in "$CERTS/server.crt" -noout -text | grep -i 'Public-Key'
cert_has '1024 bit' || { echo "FAIL: 1024비트 아님"; exit 1; }
echo "PASS(reproduce): RSA 1024비트 -> 약한 키 크기 취약 재현"
