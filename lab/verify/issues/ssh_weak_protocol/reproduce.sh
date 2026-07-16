#!/bin/sh
set -e
. /verify/issues/_ssh_lib.sh
echo "-- [reproduce] 약한 SSH KEX(diffie-hellman-group14-sha1) 허용 취약 환경 --"
ssh_reset
ssh_set 'KexAlgorithms +diffie-hellman-group14-sha1'
ssh_reload
show_ssh KexAlgorithms diffie-hellman-group14-sha1
assert_kex_offered diffie-hellman-group14-sha1
echo "PASS(reproduce): dh-group14-sha1 협상 성공 -> 약한 KEX 취약 재현"
