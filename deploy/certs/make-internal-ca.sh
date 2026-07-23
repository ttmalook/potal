#!/bin/sh
# =====================================================================
# 사내 사설 CA + 서버 인증서 생성 (외부 CA/포트 검증 불필요)
#   표준 포트(80/443)를 다른 서비스가 점유해 Let's Encrypt(HTTP-01/TLS-ALPN-01)를
#   쓸 수 없을 때 사용. 발급한 server 인증서를 nginx(certs 볼륨)에 넣고,
#   ca.crt 를 접속 PC 신뢰 저장소에 설치하면 브라우저 경고가 사라진다.
#
#   사용(값은 실제 환경으로 교체):
#     SERVER_CN=portal.example.local \
#     SAN="DNS:portal.example.local,DNS:host.iptime.org,IP:203.0.113.10,IP:10.0.0.5" \
#     sh make-internal-ca.sh ./out
#
#   · SAN 에는 브라우저에 입력하는 모든 호스트명(DNS:)과 IP(IP:)를 나열한다.
#   · 루트 CA(ca.key/ca.crt)는 최초 1회만 생성하고 이후 재사용(재배포 CA 무효화 방지).
#   · 출력: out/ca.crt(배포용) · out/fullchain.pem · out/privkey.pem(nginx용)
# =====================================================================
set -eu

OUT="${1:-./out}"
CA_DAYS="${CA_DAYS:-3650}"       # 루트 CA 유효기간(기본 10년)
SRV_DAYS="${SRV_DAYS:-825}"      # 서버 인증서(리프) — 다수 브라우저 상한 825일
SERVER_CN="${SERVER_CN:-portal.local}"
SAN="${SAN:-DNS:portal.local}"

command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl 이 필요합니다"; exit 1; }
mkdir -p "$OUT"; cd "$OUT"

# 1) 루트 CA — 최초 1회만. 이미 있으면 재사용(이미 배포한 CA 를 계속 신뢰).
if [ ! -f ca.key ] || [ ! -f ca.crt ]; then
  echo "[ca] 루트 CA 생성 (최초 1회) — ca.key 는 안전하게 보관하세요"
  openssl req -x509 -newkey rsa:4096 -nodes -keyout ca.key -out ca.crt -days "$CA_DAYS" \
    -subj "/O=SSC Partner Portal/CN=SSC Internal CA"
else
  echo "[ca] 기존 루트 CA 재사용 (ca.crt/ca.key)"
fi

# 2) 서버 키 + CSR
openssl req -newkey rsa:2048 -nodes -keyout privkey.pem -out server.csr -subj "/CN=$SERVER_CN"

# 3) CA 로 서명 (+SAN·서버 용도)
cat > server.ext <<EOF
subjectAltName=$SAN
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days "$SRV_DAYS" -extfile server.ext

# 4) nginx 용 fullchain 구성 (서버 + CA)
cat server.crt ca.crt > fullchain.pem
rm -f server.csr server.ext

echo ""
echo "생성 완료 → $OUT/"
echo "  · fullchain.pem, privkey.pem  → nginx(certs 볼륨)에 반영"
echo "  · ca.crt                      → 접속하는 각 PC/브라우저 '신뢰할 수 있는 루트 CA'에 설치"
echo ""
echo "다음 단계(VM-APP):"
echo "  WEB=\$(docker ps --filter name=web --format '{{.Names}}' | head -1)"
echo "  docker cp $OUT/fullchain.pem \$WEB:/etc/nginx/certs/fullchain.pem"
echo "  docker cp $OUT/privkey.pem   \$WEB:/etc/nginx/certs/privkey.pem"
echo "  docker compose -f docker-compose.app.yml --env-file .env restart web"
