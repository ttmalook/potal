#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "── [remediate] 강한 cipher(ECDHE-GCM 만) 조치 ──"
{ echo 'ssl_protocols TLSv1.2 TLSv1.3;'; echo 'ssl_prefer_server_ciphers on;'; echo 'ssl_ciphers "ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";'; } > "$SEC_T/ciphers.conf"
reload_tls
show_tls -tls1_2
assert_cipher_rejected AES256-SHA
assert_tls_site_ok
echo "PASS(remediate): 약한 cipher 거부(취약 해소) + 사이트 200 → 웹 이상 없음"
