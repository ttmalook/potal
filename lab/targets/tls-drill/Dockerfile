# =====================================================================
# tls-drill — 수동 검증용 가변(mutable) TLS 타깃
#  - 스크립트가 런타임에 ssl_protocols/ssl_ciphers(sec/tls/*.conf) 및 인증서(certs/)를
#    바꿔가며 실제 TLS 조치를 재현. openssl s_client / x509 로 검증.
# =====================================================================
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl curl && mkdir -p /etc/nginx/certs /etc/nginx/sec/tls
COPY default.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
