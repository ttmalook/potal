#!/bin/sh
set -e
. /verify/issues/_ssh_lib.sh
echo "-- [remediate] 강한 cipher(AEAD/CTR)만 허용 조치 --"
ssh_reset
ssh_set 'Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes256-ctr'
ssh_reload
show_ssh Ciphers 3des-cbc
assert_cipher_refused 3des-cbc
assert_ssh_ok
echo "PASS(remediate): 3des-cbc 거부(취약 해소) + 강한 알고리즘 정상 -> 서비스 이상 없음"
