#!/bin/sh
# 데이터 주도 포트 목록 — 새 네트워크 서비스 이슈 추가 시 여기에 포트만 추가.
# (collector 의 NET_PORTS 매핑과 일치해야 함)
#  21 ftp · 23 telnet · 53 dns · 143 imap · 389 ldap · 445 smb · 1723 pptp ·
#  3306 mysql · 3389 rdp · 5432 postgres · 5900 vnc · 5984 couchdb · 6379 redis ·
#  8080 http-proxy · 9042 cassandra · 9200 elasticsearch · 27017 mongodb
PORTS="21 23 53 143 389 445 1723 3306 3389 5432 5900 5984 6379 8080 9042 9200 27017"
for p in $PORTS; do
  socat TCP-LISTEN:$p,fork,reuseaddr /dev/null &
done
wait
