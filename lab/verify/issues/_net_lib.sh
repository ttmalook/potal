# =====================================================================
# _net_lib.sh — 네트워크 서비스 노출 수동 검증 공통 헬퍼 (lab-net-drill 안에서 source)
#  socat 로 포트 리스너를 열고/닫고 nc 로 개방 여부를 관측·assert.
# =====================================================================
# pkill 은 매칭 프로세스가 없으면 1 반환 → set -e 오종료 방지(|| true)
port_open()  { pkill -f "TCP-LISTEN:$1," 2>/dev/null || true; sleep 0.2; socat TCP-LISTEN:"$1",fork,reuseaddr /dev/null >/dev/null 2>&1 & sleep 0.4; }
port_close() { pkill -f "TCP-LISTEN:$1," 2>/dev/null || true; sleep 0.4; }
is_open()    { nc -z -w2 127.0.0.1 "$1" >/dev/null 2>&1; }

show_port() { printf '$ nc -z 127.0.0.1 %s -> ' "$1"; if is_open "$1"; then echo "open"; else echo "closed"; fi; }

assert_port_open()   { is_open "$1" || { echo "FAIL: 포트 $1 닫힘(취약 아님)"; exit 1; }; }
assert_port_closed() { if is_open "$1"; then echo "FAIL: 포트 $1 여전히 열림(조치 안됨)"; exit 1; fi; }
# 서비스 무해: 불필요 포트를 닫아도 정상 서비스(헬스 포트 9999)는 유지
assert_net_healthy() { is_open 9999 || { echo "FAIL: 헬스 포트 9999 닫힘 — 정상 서비스까지 손상"; exit 1; }; }
