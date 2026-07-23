# 수동 검증 가이드 — 50종

컨테이너에서 명령어를 한 줄씩 입력해 ① 취약 환경을 만들고 → ② 취약점을 확인하고 → ③ 조치 가이드의 조치 방법을 입력하고 → ④ 조치됨을 확인합니다. 자동 러너(`verify/verify.sh`)와 달리 **수동으로 검증**합니다.

## 시작 전 (공통)

```bash
cd ~/docker-test/portal/lab     # VM-LAB의 repo 경로 (환경에 맞게)
docker compose up -d            # 랩 컨테이너 기동(이미 떠 있으면 생략)
```

- 각 이슈는 **해당 타깃 컨테이너에 접속**해서 진행합니다: `docker compose exec <타깃> sh`
- 카테고리별 타깃: HTTP 헤더=`lab-http-drill`, TLS=`lab-tls-drill`, DNS=`lab-dns-drill`, SSH=`lab-ssh-drill`, 네트워크=`lab-net-drill`
- 컨테이너에서 나올 때는 `exit`
- 취약 재현/조치는 **멱등**입니다(다시 실행해도 안전). 이슈 간 간섭을 피하려면 각 이슈 시작 시 "취약 재현"부터 하세요.

---

# 1. HTTP 보안 헤더 (타깃: `lab-http-drill`)

**접속**
```bash
docker compose exec lab-http-drill sh
```
공통 도구: 관측 `curl -sSI http://localhost/` · 적용 `nginx -t && nginx -s reload` · 초기화 `rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf` · 조치 후 무해확인 `curl -s -o /dev/null -w "%{http_code}\n" http://localhost/` (→ `200`)

## 1-1. hsts_incorrect_v2 — HSTS(HTTPS 강제) 미적용

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i strict-transport-security
```
→ **아무 출력 없음** = HSTS 없음(취약).

**③ 조치**
```bash
echo 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' > /etc/nginx/sec/headers/hsts.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i strict-transport-security
```
→ **`Strict-Transport-Security: max-age=31536000; includeSubDomains`** = 조치됨.

## 1-2. x_frame_options_incorrect_v2 — X-Frame-Options(클릭재킹) 미적용

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i x-frame-options
```
→ **출력 없음** = 헤더 없음 → iframe 삽입(클릭재킹) 가능.

**③ 조치**
```bash
echo 'add_header X-Frame-Options "SAMEORIGIN" always;' > /etc/nginx/sec/headers/x-frame-options.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i x-frame-options
```
→ **`X-Frame-Options: SAMEORIGIN`** = 조치됨.

## 1-3. x_content_type_options_incorrect_v2 — MIME 스니핑 방지 헤더 미적용

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i x-content-type-options
```
→ **출력 없음** = 헤더 없음(MIME 스니핑 취약).

**③ 조치**
```bash
echo 'add_header X-Content-Type-Options "nosniff" always;' > /etc/nginx/sec/headers/x-content-type-options.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i x-content-type-options
```
→ **`X-Content-Type-Options: nosniff`** = 조치됨.

## 1-4. x_xss_protection_incorrect_v2 — X-XSS-Protection 미적용

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i x-xss-protection
```
→ **출력 없음** = 헤더 없음.

**③ 조치**
```bash
echo 'add_header X-XSS-Protection "1; mode=block" always;' > /etc/nginx/sec/headers/x-xss-protection.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i x-xss-protection
```
→ **`X-XSS-Protection: 1; mode=block`** = 조치됨.

## 1-5. csp_no_policy_v2 — CSP(콘텐츠 보안 정책) 미설정

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i content-security-policy
```
→ **출력 없음** = CSP 없음(콘텐츠 주입 취약).

**③ 조치**
```bash
echo "add_header Content-Security-Policy \"default-src 'self'\" always;" > /etc/nginx/sec/headers/csp.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i content-security-policy
```
→ **`Content-Security-Policy: default-src 'self'`** = 조치됨.

## 1-6. csp_too_broad_v2 — CSP 과도(와일드카드 `*`)

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
echo 'add_header Content-Security-Policy "default-src *" always;' > /etc/nginx/sec/headers/csp.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i content-security-policy
```
→ **`Content-Security-Policy: default-src *`** = 모든 출처 허용(과도).

**③ 조치**
```bash
echo "add_header Content-Security-Policy \"default-src 'self'\" always;" > /etc/nginx/sec/headers/csp.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i content-security-policy
```
→ **`default-src 'self'`** (와일드카드 `*` 사라짐) = 조치됨.

## 1-7. csp_unsafe_policy_v2 — CSP unsafe-inline/eval 허용

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
echo "add_header Content-Security-Policy \"default-src 'self' 'unsafe-inline' 'unsafe-eval'\" always;" > /etc/nginx/sec/headers/csp.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i content-security-policy
```
→ **`'unsafe-inline' 'unsafe-eval'` 포함** = 인라인 스크립트 실행 허용(취약).

**③ 조치**
```bash
echo "add_header Content-Security-Policy \"default-src 'self'\" always;" > /etc/nginx/sec/headers/csp.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i content-security-policy
```
→ **`unsafe-` 사라짐** = 조치됨.

## 1-8. cookie_missing_http_only — 세션 쿠키 HttpOnly 누락

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
echo 'add_header Set-Cookie "SID=lab-session-123; Path=/" always;' > /etc/nginx/sec/headers/cookie.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i set-cookie
```
→ **`Set-Cookie: SID=...; Path=/`** (HttpOnly 없음) = JS로 쿠키 탈취 가능(취약).

**③ 조치**
```bash
echo 'add_header Set-Cookie "SID=lab-session-123; Path=/; HttpOnly" always;' > /etc/nginx/sec/headers/cookie.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i set-cookie
```
→ **`...; HttpOnly`** 포함 = 조치됨.

## 1-9. cookie_missing_secure_attribute — 세션 쿠키 Secure 누락

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
echo 'add_header Set-Cookie "SID=lab-session-123; Path=/; HttpOnly" always;' > /etc/nginx/sec/headers/cookie.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -i set-cookie
```
→ **`Secure` 없음** = 평문(HTTP)으로도 쿠키 전송(취약).

**③ 조치**
```bash
echo 'add_header Set-Cookie "SID=lab-session-123; Path=/; HttpOnly; Secure" always;' > /etc/nginx/sec/headers/cookie.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -i set-cookie
```
→ **`...; Secure`** 포함 = 조치됨.

## 1-10. insecure_https_redirect_pattern_v2 — 안전하지 않은 리다이렉트(http 302)

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/headers/*.conf /etc/nginx/sec/root/*.conf
echo 'return 302 http://insecure.example/;' > /etc/nginx/sec/root/redirect.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
curl -sSI http://localhost/ | grep -iE 'HTTP/|location'
```
→ **`302` + `Location: http://...`** = 임시 리다이렉트 + 평문 목적지(다운그레이드 취약).

**③ 조치**
```bash
echo 'return 301 https://$host$request_uri;' > /etc/nginx/sec/root/redirect.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
curl -sSI http://localhost/ | grep -iE 'HTTP/|location'
```
→ **`301` + `Location: https://...`** = 영구 리다이렉트 + HTTPS 강제(조치됨).

---

# 2. TLS / 인증서 (타깃: `lab-tls-drill`)

**접속**
```bash
docker compose exec lab-tls-drill sh
```
공통: 적용 `nginx -t && nginx -s reload` · 초기화 `rm -f /etc/nginx/sec/tls/*.conf` · 조치 후 무해확인 `curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/` (→ `200`)
표준 정상 인증서 재발급(여러 조치에서 사용):
```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
```

## 2-1. tls_weak_protocol — 약한 프로토콜(TLSv1.1) 허용

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/tls/*.conf
printf 'ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;\nssl_ciphers ALL:@SECLEVEL=0;\n' > /etc/nginx/sec/tls/protocols.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
echo | openssl s_client -connect localhost:443 -tls1_1 -cipher ALL:@SECLEVEL=0 2>/dev/null | grep -E 'BEGIN CERTIFICATE'
```
→ **`-----BEGIN CERTIFICATE-----` 출력됨** = TLS1.1로 핸드셰이크 성립(취약).

**③ 조치**
```bash
echo 'ssl_protocols TLSv1.2 TLSv1.3;' > /etc/nginx/sec/tls/protocols.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
echo | openssl s_client -connect localhost:443 -tls1_1 -cipher ALL:@SECLEVEL=0 2>&1 | grep -Ei 'alert|BEGIN CERTIFICATE'
```
→ **`alert protocol version` (인증서 없음)** = TLS1.1 거부됨. TLS1.2는 정상: `echo | openssl s_client -connect localhost:443 -tls1_2 2>/dev/null | grep Protocol` → `Protocol : TLSv1.2`.

## 2-2. tls_weak_cipher — 약한 cipher(비PFS AES256-SHA) 허용

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/tls/*.conf
printf 'ssl_protocols TLSv1.2 TLSv1.3;\nssl_ciphers "ECDHE-RSA-AES256-GCM-SHA384:AES256-SHA";\n' > /etc/nginx/sec/tls/ciphers.conf
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
echo | openssl s_client -connect localhost:443 -tls1_2 -cipher AES256-SHA 2>/dev/null | grep 'Cipher is'
```
→ **`Cipher is AES256-SHA`** = 약한 cipher로 협상됨(취약).

**③ 조치**
```bash
printf 'ssl_protocols TLSv1.2 TLSv1.3;\nssl_prefer_server_ciphers on;\nssl_ciphers "ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";\n' > /etc/nginx/sec/tls/ciphers.conf
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
echo | openssl s_client -connect localhost:443 -tls1_2 -cipher AES256-SHA 2>/dev/null | grep 'Cipher is'
```
→ **`Cipher is (NONE)` 또는 강한 cipher** = AES256-SHA 협상 안 됨(조치됨).

## 2-3. insecure_server_certificate_key_size — 약한 키 크기(RSA 1024)

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/tls/*.conf
echo 'ssl_ciphers ALL:@SECLEVEL=0;' > /etc/nginx/sec/tls/seclevel.conf
openssl req -x509 -newkey rsa:1024 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -text | grep -i 'Public-Key'
```
→ **`Public-Key: (1024 bit)`** = 약한 키(취약).

**③ 조치**
```bash
rm -f /etc/nginx/sec/tls/*.conf
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -text | grep -i 'Public-Key'
```
→ **`Public-Key: (2048 bit)`** = 조치됨.

## 2-4. tlscert_weak_signature — 약한 서명(SHA-1)

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/tls/*.conf
openssl req -x509 -newkey rsa:2048 -sha1 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -text | grep -i 'Signature Algorithm' | head -1
```
→ **`sha1WithRSAEncryption`** = 약한 서명(취약).

**③ 조치**
```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -text | grep -i 'Signature Algorithm' | head -1
```
→ **`sha256WithRSAEncryption`** = 조치됨.

## 2-5. tlscert_excessive_expiration — 과도한 유효기간(10년)

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/tls/*.conf
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -enddate
```
→ **만료일이 10년 뒤** (398일 초과 = 취약).

**③ 조치**
```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -enddate
```
→ **만료일이 1년 뒤**(≤398일) = 조치됨.

## 2-6. tlscert_expired — 만료된 인증서

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/tls/*.conf
openssl req -newkey rsa:2048 -nodes -keyout /etc/nginx/certs/server.key -out /tmp/s.csr -subj "/CN=lab-tls-drill"
openssl x509 -req -in /tmp/s.csr -signkey /etc/nginx/certs/server.key -sha256 -days -1 -out /etc/nginx/certs/server.crt
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -dates
```
→ **`notAfter`가 과거 날짜** = 만료됨(취약).

**③ 조치**
```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -dates
```
→ **`notAfter`가 미래(1년 뒤)** = 조치됨.

## 2-7. tlscert_self_signed — 자가서명 인증서

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/tls/*.conf
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
echo "issuer=$(openssl x509 -in /etc/nginx/certs/server.crt -noout -issuer)"; echo "subject=$(openssl x509 -in /etc/nginx/certs/server.crt -noout -subject)"
```
→ **issuer == subject** = 자가서명(취약).

**③ 조치** (내부 CA로 서명한 인증서로 교체)
```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout /tmp/ca.key -out /tmp/ca.crt -subj "/CN=Lab Internal CA"
openssl req -newkey rsa:2048 -nodes -keyout /etc/nginx/certs/server.key -out /tmp/s.csr -subj "/CN=lab-tls-drill"
openssl x509 -req -in /tmp/s.csr -CA /tmp/ca.crt -CAkey /tmp/ca.key -CAcreateserial -sha256 -days 365 -out /etc/nginx/certs/server.crt
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
echo "issuer=$(openssl x509 -in /etc/nginx/certs/server.crt -noout -issuer)"; echo "subject=$(openssl x509 -in /etc/nginx/certs/server.crt -noout -subject)"
openssl verify -CAfile /tmp/ca.crt /etc/nginx/certs/server.crt
```
→ **issuer ≠ subject** + **`server.crt: OK`** = CA 서명(조치됨).

## 2-8. tlscert_no_revocation — 폐지 점검 수단(CRL DP) 부재

**① 취약 재현**
```bash
rm -f /etc/nginx/sec/tls/*.conf
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill"
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -text | grep -i 'CRL Distribution Points'
```
→ **출력 없음** = CRL 배포점 없음(폐지 확인 불가, 취약).

**③ 조치** (CRL Distribution Points 포함 재발급)
```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt -subj "/CN=lab-tls-drill" -addext "crlDistributionPoints=URI:http://lab-tls-drill/crl.pem"
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
openssl x509 -in /etc/nginx/certs/server.crt -noout -text | grep -A1 'CRL Distribution Points'
```
→ **`X509v3 CRL Distribution Points` + URI** = 조치됨.

## 2-9. tlscert_revoked — 폐지된 인증서

> 이 이슈는 내부 CA를 만들어 인증서를 발급·폐지·CRL 생성까지 재현합니다.

**① 취약 재현** (CA 생성 → 서버 인증서 발급 → 폐지 → CRL 생성)
```bash
rm -f /etc/nginx/sec/tls/*.conf
CA=/tmp/ca; rm -rf "$CA"; mkdir -p "$CA/newcerts"; touch "$CA/index.txt"
echo 'unique_subject = no' > "$CA/index.txt.attr"; echo 1000 > "$CA/serial"; echo 1000 > "$CA/crlnumber"
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout "$CA/ca.key" -out "$CA/ca.crt" -subj "/CN=Lab Revocation CA"
cat > "$CA/ca.cnf" <<'CNF'
[ca]
default_ca = CA_default
[CA_default]
dir = /tmp/ca
database = $dir/index.txt
new_certs_dir = $dir/newcerts
certificate = $dir/ca.crt
private_key = $dir/ca.key
serial = $dir/serial
crlnumber = $dir/crlnumber
default_md = sha256
policy = pol
default_days = 365
default_crl_days = 30
[pol]
commonName = supplied
CNF
openssl req -newkey rsa:2048 -nodes -keyout /etc/nginx/certs/server.key -out "$CA/s.csr" -subj "/CN=lab-tls-drill"
openssl ca -batch -config "$CA/ca.cnf" -in "$CA/s.csr" -out /etc/nginx/certs/server.crt
openssl ca -batch -config "$CA/ca.cnf" -revoke /etc/nginx/certs/server.crt
openssl ca -batch -config "$CA/ca.cnf" -gencrl -out "$CA/crl.pem"
nginx -t && nginx -s reload
```
**② 취약 확인**
```bash
openssl verify -crl_check -CAfile /tmp/ca/ca.crt -CRLfile /tmp/ca/crl.pem /etc/nginx/certs/server.crt
```
→ **`error 23 ... certificate revoked`** = 폐지된 인증서(취약).

**③ 조치** (같은 CA로 새 인증서 발급 + CRL 갱신)
```bash
CA=/tmp/ca
openssl req -newkey rsa:2048 -nodes -keyout /etc/nginx/certs/server.key -out "$CA/s2.csr" -subj "/CN=lab-tls-drill"
openssl ca -batch -config "$CA/ca.cnf" -in "$CA/s2.csr" -out /etc/nginx/certs/server.crt
openssl ca -batch -config "$CA/ca.cnf" -gencrl -out "$CA/crl.pem"
nginx -t && nginx -s reload
```
**④ 조치 확인**
```bash
openssl verify -crl_check -CAfile /tmp/ca/ca.crt -CRLfile /tmp/ca/crl.pem /etc/nginx/certs/server.crt
```
→ **`server.crt: OK`** = 비폐지 인증서(조치됨).

---

# 3. DNS / 이메일 인증 (타깃: `lab-dns-drill`)

**접속**
```bash
docker compose exec lab-dns-drill sh
```
공통: 관측 `dig +short @127.0.0.1 <이름> TXT` · 초기화 `: > /etc/dnsmasq/records.conf` · 레코드 추가 `echo '<레코드>' >> /etc/dnsmasq/records.conf` · 반영(재기동)
```bash
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```

## 3-1. spf_record_missing — SPF 미설정

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인**
```bash
dig +short @127.0.0.1 example.lab TXT
```
→ **출력 없음** = SPF 없음(발신자 위조 취약).

**③ 조치**
```bash
echo 'txt-record=example.lab,"v=spf1 -all"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
dig +short @127.0.0.1 example.lab TXT
```
→ **`"v=spf1 -all"`** = 조치됨.

## 3-2. spf_record_softfail — SPF softfail(`~all`)

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=example.lab,"v=spf1 ~all"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인**
```bash
dig +short @127.0.0.1 example.lab TXT
```
→ **`~all`** = softfail(위조 완화 미흡, 취약).

**③ 조치**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=example.lab,"v=spf1 -all"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
dig +short @127.0.0.1 example.lab TXT
```
→ **`-all`** (hardfail) = 조치됨.

## 3-3. spf_record_wildcard — SPF 전체 허용(`+all`)

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=example.lab,"v=spf1 +all"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인**
```bash
dig +short @127.0.0.1 example.lab TXT
```
→ **`+all`** = 모든 발신 허용(위조 무력화, 취약).

**③ 조치**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=example.lab,"v=spf1 -all"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
dig +short @127.0.0.1 example.lab TXT
```
→ **`-all`** = 조치됨.

## 3-4. spf_record_malformed — SPF 형식 오류(잘못된 IP)

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=example.lab,"v=spf1 ip4:300.1.1.1 -all"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인**
```bash
dig +short @127.0.0.1 example.lab TXT
```
→ **`ip4:300.1.1.1`** = 유효하지 않은 IP(형식 오류, 취약).

**③ 조치**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=example.lab,"v=spf1 ip4:192.0.2.0/24 -all"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
dig +short @127.0.0.1 example.lab TXT
```
→ **`ip4:192.0.2.0/24`** (유효 IP) = 조치됨.

## 3-5. dmarc_record_missing — DMARC 미설정

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인**
```bash
dig +short @127.0.0.1 _dmarc.example.lab TXT
```
→ **출력 없음** = DMARC 정책 부재(취약).

**③ 조치**
```bash
echo 'txt-record=_dmarc.example.lab,"v=DMARC1; p=reject; rua=mailto:dmarc@example.lab"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
dig +short @127.0.0.1 _dmarc.example.lab TXT
```
→ **`"v=DMARC1; p=reject; ..."`** = 조치됨.

## 3-6. dmarc_contains_none — DMARC p=none

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=_dmarc.example.lab,"v=DMARC1; p=none"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인**
```bash
dig +short @127.0.0.1 _dmarc.example.lab TXT
```
→ **`p=none`** = 모니터링만(위조 차단 안 함, 취약).

**③ 조치**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=_dmarc.example.lab,"v=DMARC1; p=reject; rua=mailto:dmarc@example.lab"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
dig +short @127.0.0.1 _dmarc.example.lab TXT
```
→ **`p=reject`** = 조치됨.

## 3-7. subdomain_dmarc_contains_none — 하위도메인 DMARC p=none

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=_dmarc.sub.example.lab,"v=DMARC1; p=none"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인**
```bash
dig +short @127.0.0.1 _dmarc.sub.example.lab TXT
```
→ **`p=none`** = 하위도메인 위조 차단 안 함(취약).

**③ 조치**
```bash
: > /etc/dnsmasq/records.conf
echo 'txt-record=_dmarc.sub.example.lab,"v=DMARC1; p=reject"' >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
dig +short @127.0.0.1 _dmarc.sub.example.lab TXT
```
→ **`p=reject`** = 조치됨.

## 3-8. dkim_weak_signature — DKIM 약한 해시(h=sha1)

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
openssl genrsa -out /tmp/dk.key 1024 2>/dev/null
PUB=$(openssl rsa -in /tmp/dk.key -pubout -outform DER 2>/dev/null | openssl base64 -A)
echo "txt-record=sel._domainkey.example.lab,\"v=DKIM1; k=rsa; h=sha1; p=$PUB\"" >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인**
```bash
dig +short @127.0.0.1 sel._domainkey.example.lab TXT | grep -o 'h=sha1'
```
→ **`h=sha1`** = 약한 해시 서명(취약).

**③ 조치**
```bash
: > /etc/dnsmasq/records.conf
openssl genrsa -out /tmp/dk.key 2048 2>/dev/null
PUB=$(openssl rsa -in /tmp/dk.key -pubout -outform DER 2>/dev/null | openssl base64 -A)
echo "txt-record=sel._domainkey.example.lab,\"v=DKIM1; k=rsa; h=sha256; p=$PUB\"" >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
dig +short @127.0.0.1 sel._domainkey.example.lab TXT | grep -o 'h=sha256'
```
→ **`h=sha256`** = 조치됨.

## 3-9. dkim_insufficient_key_length — DKIM 키 길이 부족(RSA 512)

**① 취약 재현**
```bash
: > /etc/dnsmasq/records.conf
openssl genrsa -out /tmp/dk.key 512 2>/dev/null
PUB=$(openssl rsa -in /tmp/dk.key -pubout -outform DER 2>/dev/null | openssl base64 -A)
echo "txt-record=sel._domainkey.example.lab,\"v=DKIM1; k=rsa; p=$PUB\"" >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**② 취약 확인** (게시된 공개키 비트수 계산)
```bash
p=$(dig +short @127.0.0.1 sel._domainkey.example.lab TXT | tr -d ' "' | sed 's/.*p=//')
echo "$p" | openssl base64 -d -A | openssl rsa -pubin -inform DER -text -noout 2>/dev/null | grep -o '[0-9]* bit' | head -1
```
→ **`512 bit`** = 약한 키(취약).

**③ 조치**
```bash
: > /etc/dnsmasq/records.conf
openssl genrsa -out /tmp/dk.key 2048 2>/dev/null
PUB=$(openssl rsa -in /tmp/dk.key -pubout -outform DER 2>/dev/null | openssl base64 -A)
echo "txt-record=sel._domainkey.example.lab,\"v=DKIM1; k=rsa; p=$PUB\"" >> /etc/dnsmasq/records.conf
kill $(cat /run/dnsmasq.pid) 2>/dev/null; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
```
**④ 조치 확인**
```bash
p=$(dig +short @127.0.0.1 sel._domainkey.example.lab TXT | tr -d ' "' | sed 's/.*p=//')
echo "$p" | openssl base64 -d -A | openssl rsa -pubin -inform DER -text -noout 2>/dev/null | grep -o '[0-9]* bit' | head -1
```
→ **`2048 bit`** = 조치됨.

---

# 4. SSH (타깃: `lab-ssh-drill`)

**접속**
```bash
docker compose exec lab-ssh-drill sh
```
공통: 설정 초기화 `: > /etc/ssh/sshd_config.d/drill.conf` · 설정 추가 `echo '<줄>' >> /etc/ssh/sshd_config.d/drill.conf` · 반영 `pkill -HUP sshd`
관측(약한 알고리즘 강제 접속 시도): 인증은 실패하지만 **cipher/kex 협상은 인증 前**에 일어나 제공/거부를 판정합니다.
- **`Permission denied`** 가 뜨면 = 협상 성공(약한 것 제공됨, 취약)
- **`no matching cipher`/`no matching key exchange`** 가 뜨면 = 거부됨(조치됨)

## 4-1. ssh_weak_cipher — 약한 SSH cipher(3des-cbc) 허용

**① 취약 재현**
```bash
: > /etc/ssh/sshd_config.d/drill.conf
echo 'Ciphers +3des-cbc,aes128-cbc' >> /etc/ssh/sshd_config.d/drill.conf
pkill -HUP sshd
```
**② 취약 확인**
```bash
ssh -o Ciphers=3des-cbc -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 nouser@127.0.0.1 true 2>&1 | grep -iE 'Permission denied|no matching cipher'
```
→ **`Permission denied`** = 3des-cbc 협상 성공(취약).

**③ 조치**
```bash
: > /etc/ssh/sshd_config.d/drill.conf
echo 'Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes256-ctr' >> /etc/ssh/sshd_config.d/drill.conf
pkill -HUP sshd
```
**④ 조치 확인**
```bash
ssh -o Ciphers=3des-cbc -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 nouser@127.0.0.1 true 2>&1 | grep -iE 'Permission denied|no matching cipher'
```
→ **`no matching cipher found`** = 3des-cbc 거부(조치됨). 강한 cipher는 정상: 위 명령에서 `Ciphers=3des-cbc`를 `Ciphers=aes256-ctr`로 바꾸면 `Permission denied`(협상 통과).

## 4-2. ssh_weak_protocol — 약한 SSH KEX(diffie-hellman-group14-sha1) 허용

**① 취약 재현**
```bash
: > /etc/ssh/sshd_config.d/drill.conf
echo 'KexAlgorithms +diffie-hellman-group14-sha1' >> /etc/ssh/sshd_config.d/drill.conf
pkill -HUP sshd
```
**② 취약 확인**
```bash
ssh -o KexAlgorithms=diffie-hellman-group14-sha1 -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 nouser@127.0.0.1 true 2>&1 | grep -iE 'Permission denied|no matching key exchange'
```
→ **`Permission denied`** = 약한 KEX 협상 성공(취약).

**③ 조치**
```bash
: > /etc/ssh/sshd_config.d/drill.conf
echo 'KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512' >> /etc/ssh/sshd_config.d/drill.conf
pkill -HUP sshd
```
**④ 조치 확인**
```bash
ssh -o KexAlgorithms=diffie-hellman-group14-sha1 -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 nouser@127.0.0.1 true 2>&1 | grep -iE 'Permission denied|no matching key exchange'
```
→ **`no matching key exchange method`** = 약한 KEX 거부(조치됨).

---

# 5. 네트워크 포트 노출 (타깃: `lab-net-drill`)

**접속**
```bash
docker compose exec lab-net-drill sh
```
20개 이슈 모두 **동일 절차**입니다 — 아래에서 `PORT`만 각 이슈 값으로 바꾸면 됩니다. (헬스 포트 `9999`는 정상 서비스로, 조치 후에도 열려 있어야 함)

**① 취약 재현** (해당 포트에 리스너 열기)
```bash
PORT=<포트>
socat TCP-LISTEN:$PORT,fork,reuseaddr /dev/null &
```
**② 취약 확인**
```bash
nc -z -w2 127.0.0.1 $PORT && echo open || echo closed
```
→ **`open`** = 외부 노출(취약).

**③ 조치** (서비스 중지/방화벽 차단 = 리스너 종료)
```bash
pkill -f "TCP-LISTEN:$PORT,"
```
**④ 조치 확인**
```bash
nc -z -w2 127.0.0.1 $PORT && echo open || echo closed
```
→ **`closed`** = 차단됨(조치됨).

**⑤ 서비스 무해 확인** (정상 서비스 포트는 유지)
```bash
nc -z -w2 127.0.0.1 9999 && echo "health OK" || echo "health DOWN"
```
→ **`health OK`**.

## 이슈별 포트 표

| 이슈 | PORT | 서비스 |
|---|---|---|
| insecure_ftp | 21 | FTP(평문) |
| service_ftp | 21 | FTP |
| insecure_telnet | 23 | Telnet(평문) |
| service_telnet | 23 | Telnet |
| service_dns | 53 | DNS 노출 |
| service_imap | 143 | IMAP |
| service_ldap | 389 | LDAP |
| service_ldap_anonymous | 389 | LDAP(익명) |
| service_smb | 445 | SMB |
| service_pptp | 1723 | PPTP |
| service_http_proxy | 3128 | HTTP Proxy |
| service_mysql | 3306 | MySQL |
| service_rdp | 3389 | RDP |
| service_couchdb | 5984 | CouchDB |
| service_redis | 6379 | Redis |
| open_port | 8081 | 불필요 개방 포트 |
| service_elasticsearch | 9200 | Elasticsearch |
| service_cassandra | 9042 | Cassandra |
| service_mongodb | 27017 | MongoDB |
| service_vnc | 5900 | VNC |

---

## 부록 — 전체 자동 검증

위 50종을 자동으로(취약 재현 → 조치 → 해소·무해 assert) 한 번에 돌리려면:
```bash
cd ~/docker-test/portal/lab
sh verify/verify.sh --all          # 전체 (PASS/FAIL 요약)
sh verify/verify.sh <issue_type>   # 특정 이슈만
```
이 수동 가이드는 그 자동 검증이 실제로 무엇을 하는지 **한 줄씩 확인**하기 위한 것입니다.
