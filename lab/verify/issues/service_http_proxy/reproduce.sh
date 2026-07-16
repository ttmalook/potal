#!/bin/sh
set -e
. /verify/issues/_net_lib.sh
PORT=3128
echo "-- [reproduce] tcp/$PORT (HTTP-Proxy) 노출 취약 환경 --"
port_open $PORT
show_port $PORT
assert_port_open $PORT
echo "PASS(reproduce): tcp/$PORT(HTTP-Proxy) 외부 노출 -> 취약 재현"
