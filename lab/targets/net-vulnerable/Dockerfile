# 네트워크 서비스 노출(취약) 타깃 — 여러 포트를 안정적으로 리스닝.
#  socat TCP-LISTEN:...,fork 는 연결마다 fork하고 계속 리스닝 → busybox nc 루프의
#  '재시작 순간 포트 닫힘'(flaky) 문제 없음. 실제 서비스는 아니고 포트 노출만 재현.
FROM alpine:3.19
RUN apk add --no-cache socat
COPY listen.sh /listen.sh
RUN chmod +x /listen.sh
CMD ["/bin/sh", "/listen.sh"]
