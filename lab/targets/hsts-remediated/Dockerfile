FROM nginx:1.27-alpine
# HSTS 조치 타깃 — HTTPS(자체서명) + HTTP→HTTPS 강제 리다이렉트 + HSTS 헤더.
RUN apk add --no-cache openssl \
 && mkdir -p /etc/nginx/certs \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
      -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt \
      -subj "/CN=lab-hsts-remediated"
COPY default.conf /etc/nginx/conf.d/default.conf
