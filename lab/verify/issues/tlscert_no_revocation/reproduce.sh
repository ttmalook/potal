#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [reproduce] 폐지 점검 수단 없음(CRL DP 부재) 취약 환경 --"
reset_tls
good_cert
reload_tls
if cert_has 'CRL Distribution Points'; then echo "FAIL: CRL DP 존재(취약 아님)"; exit 1; fi
echo "PASS(reproduce): CRL Distribution Points 없음 -> 폐지 확인 불가 취약 재현"
