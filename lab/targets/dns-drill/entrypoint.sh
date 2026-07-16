#!/bin/sh
# dnsmasq 를 백그라운드로 기동(스크립트가 재시작으로 레코드 반영). 컨테이너는 살아 있음.
set -e
mkdir -p /etc/dnsmasq
[ -f /etc/dnsmasq/records.conf ] || : > /etc/dnsmasq/records.conf
dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid
exec tail -f /dev/null
