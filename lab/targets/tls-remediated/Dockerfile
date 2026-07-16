# 조치 TLS 타깃 — 적정 유효기간(90일) · 2048비트 · TLS1.2/1.3 · 강한 암호
#  + 자체서명이 아니라 내부 CA로 서명(issuer != subject) → tlscert_self_signed 조치 재현.
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl && \
    openssl req -x509 -newkey rsa:2048 -nodes -keyout /etc/nginx/ca.key -out /etc/nginx/ca.crt \
      -days 3650 -subj "/CN=Lab Root CA" && \
    openssl req -newkey rsa:2048 -nodes -keyout /etc/nginx/tls.key -out /etc/nginx/tls.csr \
      -subj "/CN=lab-tls-remediated" && \
    openssl x509 -req -in /etc/nginx/tls.csr -CA /etc/nginx/ca.crt -CAkey /etc/nginx/ca.key \
      -CAcreateserial -out /etc/nginx/tls.crt -days 90 -sha256
COPY default.conf /etc/nginx/conf.d/default.conf
