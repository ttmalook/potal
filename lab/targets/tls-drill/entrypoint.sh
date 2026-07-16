#!/bin/sh
# 기본 인증서(정상·RSA2048·유효)를 없으면 생성 후 nginx 기동.
# 인증서 계열 검증 스크립트가 이 파일들을 덮어써 시나리오(만료/자가서명/약한키 등)를 재현한다.
set -e
CERTS=/etc/nginx/certs
if [ ! -f "$CERTS/server.crt" ] || [ ! -f "$CERTS/server.key" ]; then
  mkdir -p "$CERTS"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
    -keyout "$CERTS/server.key" -out "$CERTS/server.crt" \
    -subj "/CN=lab-tls-drill" >/dev/null 2>&1
fi
exec nginx -g 'daemon off;'
