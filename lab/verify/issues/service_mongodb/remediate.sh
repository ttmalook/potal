#!/bin/sh
set -e
. /verify/issues/_net_lib.sh
PORT=27017
echo "-- [remediate] tcp/$PORT (MongoDB) 차단(서비스 중지/방화벽) 조치 --"
port_close $PORT
show_port $PORT
assert_port_closed $PORT
assert_net_healthy
echo "PASS(remediate): tcp/$PORT 닫힘(취약 해소) + 헬스 9999 정상 -> 서비스 이상 없음"
