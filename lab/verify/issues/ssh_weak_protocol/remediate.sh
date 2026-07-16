#!/bin/sh
set -e
. /verify/issues/_ssh_lib.sh
echo "-- [remediate] 강한 KEX(curve25519/group16)만 허용 조치 --"
ssh_reset
ssh_set 'KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512'
ssh_reload
show_ssh KexAlgorithms diffie-hellman-group14-sha1
assert_kex_refused diffie-hellman-group14-sha1
assert_ssh_ok
echo "PASS(remediate): dh-group14-sha1 거부(취약 해소) + 강한 KEX 정상 -> 서비스 이상 없음"
