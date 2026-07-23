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

# 실제 협상된 값 파싱(핸드셰이크 실패 시 빈 값). 'New,' 라인의 프로토콜 라벨은 openssl 이
#  SSLv3/TLSv1.0 처럼 부정확히 찍을 수 있어 신뢰하지 않고, 'Protocol :' / 'Cipher is' 값을 본다.
#  핸드셰이크 성공만으로 판정하면 openssl 이 약한 것을 강제해도 강한 것으로 협상해 오탐 → 실제 값 비교.
_neg_proto()  { echo | openssl s_client -connect "$HP" "$@" 2>/dev/null | sed -n 's/.*Protocol *: *//p' | head -1; }
_neg_cipher() { echo | openssl s_client -connect "$HP" "$@" 2>/dev/null | sed -n 's/.*Cipher is *//p'   | head -1; }
_proto_ver()  { printf 'TLSv%s' "$(printf '%s' "$1" | sed 's/^-tls//; s/_/./')"; }  # -tls1_1 → TLSv1.1

# 프로토콜 협상 가부 ($1 = -tls1_1 등) — 강제한 버전으로 '실제로' 협상됐는지(Protocol 값)로 판정
assert_proto_enabled()  { v=$(_proto_ver "$1"); p=$(_neg_proto "$1" -cipher 'ALL:@SECLEVEL=0'); [ "$p" = "$v" ] || { echo "FAIL: $1 미협상(실제: ${p:-없음}, 취약 아님)"; exit 1; }; }
assert_proto_disabled() { v=$(_proto_ver "$1"); p=$(_neg_proto "$1" -cipher 'ALL:@SECLEVEL=0'); [ "$p" != "$v" ] || { echo "FAIL: $1 협상됨($p, 조치 안됨)"; exit 1; }; }

# cipher 협상 가부 ($1 = 예: AES256-SHA) — 강제한 cipher 로 '실제로' 협상됐는지(Cipher 값)로 판정
assert_cipher_accepted() { c=$(_neg_cipher -tls1_2 -cipher "$1"); [ "$c" = "$1" ] || { echo "FAIL: cipher $1 미협상(실제: ${c:-없음}, 취약 아님)"; exit 1; }; }
assert_cipher_rejected() { c=$(_neg_cipher -tls1_2 -cipher "$1"); [ "$c" != "$1" ] || { echo "FAIL: cipher $1 협상됨(조치 안됨)"; exit 1; }; }

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
