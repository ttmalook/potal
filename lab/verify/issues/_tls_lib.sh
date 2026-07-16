# =====================================================================
# _tls_lib.sh — TLS 수동 검증 공통 헬퍼 (lab-tls-drill 안에서 source)
#  실제 openssl s_client / x509 로 관측하고 assert. 실패 시 즉시 exit 1.
# =====================================================================
SEC_T=/etc/nginx/sec/tls
CERTS=/etc/nginx/certs
HP=localhost:443

reset_tls()  { rm -f "$SEC_T"/*.conf 2>/dev/null || true; }
reload_tls() { nginx -t && nginx -s reload && sleep 0.5; }

# 핸드셰이크 성공 = 서버 인증서 수신
_hs() { echo | openssl s_client -connect "$HP" "$@" 2>/dev/null | grep -q 'BEGIN CERTIFICATE'; }

# 프로토콜 협상 가부 ($1 = -tls1_1 등)
assert_proto_enabled()  { if ! _hs "$1" -cipher 'ALL:@SECLEVEL=0'; then echo "FAIL: $1 미협상(취약 아님)"; exit 1; fi; }
assert_proto_disabled() { if _hs "$1" -cipher 'ALL:@SECLEVEL=0'; then echo "FAIL: $1 협상됨(조치 안됨)"; exit 1; fi; }

# cipher 협상 가부 ($1 = 예: AES256-SHA)
assert_cipher_accepted() { if ! _hs -tls1_2 -cipher "$1"; then echo "FAIL: cipher $1 미협상(취약 아님)"; exit 1; fi; }
assert_cipher_rejected() { if _hs -tls1_2 -cipher "$1"; then echo "FAIL: cipher $1 협상됨(조치 안됨)"; exit 1; fi; }

# 현재 협상 결과 출력(사람이 눈으로)
show_tls() { echo "\$ openssl s_client -connect $HP $*"; echo | openssl s_client -connect "$HP" "$@" 2>/dev/null | grep -E 'Protocol|Cipher is' | head -2; echo ""; }

# 서비스 무해: TLSv1.2+ 로 https 200 (curl -k: 서비스 가동 여부 확인, 인증서 검증은 x509 로 별도)
assert_tls_site_ok() {
  code=$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/)
  [ "$code" = "200" ] || { echo "FAIL: TLS 사이트 비정상(HTTP $code) — 조치가 서비스를 손상"; exit 1; }
}

# 표준 정상 서버 인증서(RSA2048·SHA256·365일 자가서명) 생성 → certs/server.{crt,key}
good_cert() {
  openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
    -keyout "$CERTS/server.key" -out "$CERTS/server.crt" -subj "/CN=lab-tls-drill" 2>/dev/null
}
# 인증서 텍스트 grep 헬퍼
cert_has()  { openssl x509 -in "$CERTS/server.crt" -noout -text 2>/dev/null | grep -qi -- "$1"; }
cert_dates(){ openssl x509 -in "$CERTS/server.crt" -noout -dates 2>/dev/null; }
