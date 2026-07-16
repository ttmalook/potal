# =====================================================================
# http-drill — 수동 검증용 가변(mutable) HTTP 타깃
#  - 정적 취약/조치 타깃과 달리, 런타임에 nginx 설정을 바꿔가며 실제 운영자 조치를 재현.
#  - headers/*.conf(서버 레벨 헤더) · root/*.conf(location 레벨: 리다이렉트 등)를
#    검증 스크립트가 쓰고/지우고 nginx -s reload 로 반영.
#  - curl 포함(스크립트 assert 용).
# =====================================================================
FROM nginx:1.27-alpine
RUN apk add --no-cache curl && mkdir -p /etc/nginx/sec/headers /etc/nginx/sec/root
COPY default.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
