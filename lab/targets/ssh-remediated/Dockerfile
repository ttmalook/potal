# 조치 SSH 타깃 — 강한 cipher(GCM/CTR)·강한 KEX(curve25519/sha512)·강한 MAC(etm) 만.
FROM alpine:3.19
RUN apk add --no-cache openssh && ssh-keygen -A
COPY sshd_config /etc/ssh/sshd_config
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
