#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "── [reproduce] 약한 cipher(비PFS AES256-SHA 허용) 취약 환경 ──"
reset_tls
{ echo 'ssl_protocols TLSv1.2 TLSv1.3;'; echo 'ssl_ciphers "ECDHE-RSA-AES256-GCM-SHA384:AES256-SHA";'; } > "$SEC_T/ciphers.conf"
reload_tls
show_tls -tls1_2 -cipher 'AES256-SHA'
assert_cipher_accepted AES256-SHA
echo "PASS(reproduce): 비PFS AES256-SHA 협상 성공 → 약한 cipher 취약 재현"
