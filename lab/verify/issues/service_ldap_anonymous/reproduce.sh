#!/bin/sh
set -e
. /verify/issues/_net_lib.sh
PORT=389
echo "-- [reproduce] tcp/$PORT (LDAP-익명) 노출 취약 환경 --"
port_open $PORT
show_port $PORT
assert_port_open $PORT
echo "PASS(reproduce): tcp/$PORT(LDAP-익명) 외부 노출 -> 취약 재현"
