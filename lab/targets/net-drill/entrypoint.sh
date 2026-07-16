#!/bin/sh
# 헬스 서비스(정상 유지되어야 하는 포트)를 9999 에 상시 기동. 컨테이너는 살아 있음.
# 이슈별 포트는 검증 스크립트가 socat 로 열고/닫는다.
set -e
socat TCP-LISTEN:9999,fork,reuseaddr /dev/null >/dev/null 2>&1 &
exec tail -f /dev/null
