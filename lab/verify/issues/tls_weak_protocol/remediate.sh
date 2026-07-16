#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "── [remediate] 약한 프로토콜 비활성(TLSv1.2+ 만) 조치 ──"
echo 'ssl_protocols TLSv1.2 TLSv1.3;' > "$SEC_T/protocols.conf"
reload_tls
show_tls -tls1_2
assert_proto_disabled -tls1_1
assert_proto_enabled -tls1_2
assert_tls_site_ok
echo "PASS(remediate): TLSv1.1 차단(취약 해소) + TLSv1.2 정상·사이트 200 → 웹 이상 없음"
