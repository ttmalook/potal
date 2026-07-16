# =====================================================================
# net-drill — 수동 검증용 가변(mutable) 네트워크 서비스 노출 타깃
#  - socat 로 특정 포트 리스너를 런타임에 열고/닫아 서비스 노출/차단을 재현.
#  - nc 로 포트 개방 여부 관측. 헬스 포트(9999)는 항상 유지(조치가 서비스를 죽이지 않음 확인).
# =====================================================================
FROM alpine:3.20
RUN apk add --no-cache socat netcat-openbsd
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
