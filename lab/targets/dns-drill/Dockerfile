# =====================================================================
# dns-drill — 수동 검증용 가변(mutable) DNS 타깃
#  - dnsmasq 로 TXT(SPF/DMARC/DKIM) 레코드를 런타임에 바꿔가며 실제 DNS 조치 재현.
#  - dig(bind-tools)·openssl(DKIM 키) 포함. 스크립트가 컨테이너 안에서 실행.
#  - CoreDNS 이미지는 셸/도구가 없어 사용 불가 → alpine+dnsmasq 채택.
# =====================================================================
FROM alpine:3.20
RUN apk add --no-cache dnsmasq bind-tools openssl
COPY dnsmasq.conf /etc/dnsmasq/dnsmasq.conf
COPY entrypoint.sh /entrypoint.sh
RUN mkdir -p /etc/dnsmasq && chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
