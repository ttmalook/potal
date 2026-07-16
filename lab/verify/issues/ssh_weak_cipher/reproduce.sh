#!/bin/sh
set -e
. /verify/issues/_ssh_lib.sh
echo "-- [reproduce] 약한 SSH cipher(3des-cbc) 허용 취약 환경 --"
ssh_reset
ssh_set 'Ciphers +3des-cbc,aes128-cbc'
ssh_reload
show_ssh Ciphers 3des-cbc
assert_cipher_offered 3des-cbc
echo "PASS(reproduce): 3des-cbc 협상 성공 -> 약한 cipher 취약 재현"
