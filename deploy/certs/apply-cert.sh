#!/bin/sh
# =====================================================================
# Let's Encrypt 인증서를 nginx(web 컨테이너 certs 볼륨)에 반영
#   · /etc/letsencrypt/live/<domain>/ 의 fullchain·privkey 를 web 컨테이너
#     /etc/nginx/certs/ 로 복사하고 web 을 재시작한다.
#   · live/ 는 archive/ 로의 심링크라 그대로 docker cp 하면 컨테이너 안에서
#     깨진다 → readlink -f 로 실파일을 복사한다.
#   · 발급/갱신(certbot) 후 이 스크립트만 실행하면 반영된다.
#
#   사용:  sudo sh apply-cert.sh <domain> [web_container]
#   예:    sudo sh apply-cert.sh app.example.cloud
#          sudo sh apply-cert.sh app.example.cloud deploy-web-1
# =====================================================================
set -eu

DOMAIN="${1:?사용법: sudo sh apply-cert.sh <domain> [web_container]}"
WEB="${2:-$(docker ps --filter name=web --format '{{.Names}}' | head -1)}"
LIVE="/etc/letsencrypt/live/$DOMAIN"

[ -n "$WEB" ] || { echo "ERROR: web 컨테이너를 못 찾음. 두 번째 인자로 지정하세요."; exit 1; }
[ -f "$LIVE/fullchain.pem" ] || { echo "ERROR: $LIVE/fullchain.pem 없음 (도메인/발급 확인)"; exit 1; }

echo "[cert] $DOMAIN → $WEB:/etc/nginx/certs/"
docker cp "$(readlink -f "$LIVE/fullchain.pem")" "$WEB:/etc/nginx/certs/fullchain.pem"
docker cp "$(readlink -f "$LIVE/privkey.pem")"   "$WEB:/etc/nginx/certs/privkey.pem"
docker restart "$WEB" >/dev/null

echo "[cert] 반영 완료. 확인:"
echo "  echo | openssl s_client -connect localhost:443 -servername $DOMAIN 2>/dev/null | openssl x509 -noout -issuer -subject -dates"
