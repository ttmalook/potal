# =====================================================================
# ssh-drill — 수동 검증용 가변(mutable) SSH 타깃
#  - sshd(openssh)의 Ciphers/KexAlgorithms/MACs 를 런타임에 바꿔 실제 SSH 조치 재현.
#  - ssh 클라이언트로 특정 알고리즘 협상 시도 → 제공/거부 판정.
# =====================================================================
FROM alpine:3.20
RUN apk add --no-cache openssh openssh-client
COPY entrypoint.sh /entrypoint.sh
RUN mkdir -p /etc/ssh/sshd_config.d /run/sshd && chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
