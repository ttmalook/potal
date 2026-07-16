#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "── [reproduce] 약한 프로토콜(TLSv1.1 허용) 취약 환경 ──"
reset_tls
{ echo 'ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;'; echo 'ssl_ciphers ALL:@SECLEVEL=0;'; } > "$SEC_T/protocols.conf"
reload_tls
show_tls -tls1_1 -cipher 'ALL:@SECLEVEL=0'
assert_proto_enabled -tls1_1
echo "PASS(reproduce): TLSv1.1 핸드셰이크 성공 → 약한 프로토콜 취약 재현"
