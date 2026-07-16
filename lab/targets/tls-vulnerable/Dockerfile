# 취약 TLS 타깃 — OpenSSL 1.1.1(구버전 프로토콜/약한 암호/1024비트 키 지원)
#  재현 취약점: 유효기간 과다(3650일) · 약한 키(1024) · 구버전 프로토콜(TLS1.0/1.1) · 약한 암호
#              · 약한 서명 해시(SHA-1: sha1WithRSAEncryption) ← -sha1 명시
FROM nginx:1.20-alpine
RUN apk add --no-cache openssl && \
    openssl req -x509 -newkey rsa:1024 -nodes -sha1 \
      -keyout /etc/nginx/tls.key -out /etc/nginx/tls.crt \
      -days 3650 -subj "/CN=lab-tls-vulnerable"
COPY default.conf /etc/nginx/conf.d/default.conf
