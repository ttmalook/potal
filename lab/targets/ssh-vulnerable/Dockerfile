# 취약 SSH 타깃 — 약한 cipher(CBC/3DES)·약한 KEX(sha1)·약한 MAC(md5/sha1) 제공.
#  실제 로그인은 불필요(알고리즘 열거는 pre-auth). host key만 있으면 sshd 기동.
FROM alpine:3.19
RUN apk add --no-cache openssh && ssh-keygen -A
COPY sshd_config /etc/ssh/sshd_config
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
