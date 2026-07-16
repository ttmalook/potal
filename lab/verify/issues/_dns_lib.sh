# =====================================================================
# _dns_lib.sh — DNS 수동 검증 공통 헬퍼 (lab-dns-drill 안에서 source)
#  dnsmasq TXT(SPF/DMARC/DKIM) 를 재작성·재기동하고 dig 로 관측·assert.
# =====================================================================
REC=/etc/dnsmasq/records.conf

dns_reset()  { : > "$REC"; }
dns_add()    { printf '%s\n' "$1" >> "$REC"; }         # 예: dns_add 'txt-record=example.lab,"v=spf1 -all"'
dns_reload() { kill "$(cat /run/dnsmasq.pid 2>/dev/null)" 2>/dev/null; sleep 0.3; dnsmasq --conf-file=/etc/dnsmasq/dnsmasq.conf --pid-file=/run/dnsmasq.pid; sleep 0.4; }

txt()      { dig +short @127.0.0.1 "$1" TXT 2>/dev/null; }
show_txt() { echo "\$ dig +short @127.0.0.1 $1 TXT"; txt "$1"; echo ""; }

assert_txt_absent()   { if [ -n "$(txt "$1")" ]; then echo "FAIL: $1 TXT 존재(취약 아님)"; exit 1; fi; }
assert_txt_present()  { [ -n "$(txt "$1")" ] || { echo "FAIL: $1 TXT 없음"; exit 1; }; }
assert_txt_contains() { txt "$1" | grep -qiF -- "$2" || { echo "FAIL: $1 TXT 에 '$2' 없음"; exit 1; }; }
assert_txt_lacks()    { if txt "$1" | grep -qiF -- "$2"; then echo "FAIL: $1 TXT 에 '$2' 존재(취약)"; exit 1; fi; }

# DNS 서비스 무해: 조치 후에도 정상 응답(레코드 반환)
assert_dns_ok() { [ -n "$(txt "$1")" ] || { echo "FAIL: $1 무응답 — DNS 서비스 이상"; exit 1; }; }
