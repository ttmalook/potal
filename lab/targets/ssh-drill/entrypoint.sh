#!/bin/sh
# 호스트키 생성 후 sshd 를 백그라운드 기동(스크립트가 SIGHUP 으로 설정 반영). 컨테이너는 살아 있음.
set -e
ssh-keygen -A >/dev/null 2>&1
mkdir -p /etc/ssh/sshd_config.d /run/sshd
cat > /etc/ssh/sshd_config <<'CFG'
Port 22
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key
PermitRootLogin no
PasswordAuthentication no
# 알고리즘(Ciphers/KexAlgorithms/MACs)은 검증 스크립트가 아래 include 에서 조작
Include /etc/ssh/sshd_config.d/*.conf
CFG
[ -f /etc/ssh/sshd_config.d/drill.conf ] || : > /etc/ssh/sshd_config.d/drill.conf
/usr/sbin/sshd
exec tail -f /dev/null
