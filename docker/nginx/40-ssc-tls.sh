#!/bin/sh
# =====================================================================
# nginx 기동 전 준비 (공식 엔트리포인트가 실행)
#  1) 자체서명 인증서 생성 (없을 때만)  — 도메인 구매 후 실인증서로 교체
#  2) HSTS 스니펫 생성 (ENABLE_HSTS 에 따라)  — 스테이징/자체서명 구간은 기본 off
# =====================================================================
set -e

CERT_DIR=/etc/nginx/certs
SNIP_DIR=/etc/nginx/snippets
mkdir -p "$CERT_DIR" "$SNIP_DIR"

# ── 1) 인증서 ──
if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  CN="${SERVER_NAME:-localhost}"
  echo "[ssc-tls] 자체서명 인증서 생성 (CN=$CN) — 운영 전환 시 실인증서로 교체하세요"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CERT_DIR/privkey.pem" -out "$CERT_DIR/fullchain.pem" \
    -days 365 -subj "/CN=$CN" \
    -addext "subjectAltName=DNS:${CN},DNS:localhost,IP:127.0.0.1"
else
  echo "[ssc-tls] 기존 인증서 사용 ($CERT_DIR)"
fi

# ── 2) HSTS ──
if [ "${ENABLE_HSTS}" = "true" ]; then
  echo "add_header Strict-Transport-Security \"max-age=${HSTS_MAX_AGE:-300}\" always;" > "$SNIP_DIR/hsts.conf"
  echo "[ssc-tls] HSTS on (max-age=${HSTS_MAX_AGE:-300})"
else
  : > "$SNIP_DIR/hsts.conf"
  echo "[ssc-tls] HSTS off (스테이징/자체서명 — 실도메인+실인증서 검증 후 켜세요)"
fi
