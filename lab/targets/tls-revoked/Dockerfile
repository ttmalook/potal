# 인증서 폐지(revocation) 재현 타깃 — 실제 CA 로 인증서를 발급/폐지하고 CRL 을 생성.
#  · valid.crt   : CA 발급, 폐지 안 됨 (조치 상태)
#  · revoked.crt : CA 발급 후 openssl ca -revoke 로 폐지 → CRL 에 등재 (취약 상태)
#  · ca.crt / crl.pem 과 함께 HTTP(:80)로 서빙 → 수집기가 fetch 후 openssl verify -crl_check 로 실검증.
FROM alpine:3.20
RUN apk add --no-cache openssl darkhttpd
WORKDIR /pki
RUN set -e; \
    mkdir -p demoCA/newcerts /www; touch demoCA/index.txt; echo 1000 > demoCA/serial; echo 1000 > demoCA/crlnumber; \
    # 루트 CA
    openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 3650 -subj "/CN=Lab Revocation CA" -sha256; \
    # 유효 인증서(폐지 안 됨)
    openssl req -newkey rsa:2048 -nodes -keyout valid.key -out valid.csr -subj "/CN=lab-valid-cert"; \
    openssl x509 -req -in valid.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out valid.crt -days 365 -sha256; \
    # 폐지 대상 인증서(index 에 등재되도록 openssl ca 로 발급)
    openssl req -newkey rsa:2048 -nodes -keyout revoked.key -out revoked.csr -subj "/CN=lab-revoked-cert"; \
    openssl ca -batch -config /etc/ssl/openssl.cnf -policy policy_anything -keyfile ca.key -cert ca.crt \
      -in revoked.csr -out revoked.crt -days 365 -md sha256 -notext; \
    # 폐지 처리 + CRL 생성
    openssl ca -batch -config /etc/ssl/openssl.cnf -keyfile ca.key -cert ca.crt -revoke revoked.crt; \
    openssl ca -batch -config /etc/ssl/openssl.cnf -keyfile ca.key -cert ca.crt -gencrl -out crl.pem; \
    cp ca.crt crl.pem valid.crt revoked.crt /www/
EXPOSE 80
CMD ["darkhttpd", "/www", "--port", "80"]
