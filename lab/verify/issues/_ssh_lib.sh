# =====================================================================
# _ssh_lib.sh — SSH 수동 검증 공통 헬퍼 (lab-ssh-drill 안에서 source)
#  sshd Ciphers/KexAlgorithms 를 재작성·재기동(SIGHUP)하고 ssh 클라이언트로 협상 시도해 assert.
#  (인증은 실패하지만 cipher/kex 협상은 인증 前에 일어나므로 제공/거부 판정 가능)
# =====================================================================
DRILL=/etc/ssh/sshd_config.d/drill.conf

ssh_reset()  { : > "$DRILL"; }
ssh_set()    { printf '%s\n' "$1" >> "$DRILL"; }
ssh_reload() { pkill -HUP sshd 2>/dev/null; sleep 0.6; }

_neg() { ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 "$@" nouser@127.0.0.1 true 2>&1; }

assert_cipher_offered() { if _neg -o Ciphers="$1"        | grep -qi 'no matching cipher';       then echo "FAIL: cipher $1 미제공(취약 아님)"; exit 1; fi; }
assert_cipher_refused() { _neg -o Ciphers="$1"           | grep -qi 'no matching cipher'        || { echo "FAIL: cipher $1 여전히 제공(조치 안됨)"; exit 1; }; }
assert_kex_offered()    { if _neg -o KexAlgorithms="$1"  | grep -qi 'no matching key exchange';  then echo "FAIL: kex $1 미제공(취약 아님)"; exit 1; fi; }
assert_kex_refused()    { _neg -o KexAlgorithms="$1"     | grep -qi 'no matching key exchange'   || { echo "FAIL: kex $1 여전히 제공(조치 안됨)"; exit 1; }; }

# 서비스 무해: 기본(강한) 알고리즘으로는 협상 통과(인증 단계 도달) — no matching / 접속불가 없어야
#  (ssh 는 인증 실패로 255 반환 → set -e 오종료 방지 위해 || true)
assert_ssh_ok() { o=$(_neg || true); if echo "$o" | grep -qiE 'no matching|Connection refused|timed out'; then echo "FAIL: ssh 서비스 이상 -> $o"; exit 1; fi; }

show_ssh() { echo "\$ ssh -o $1=$2 ... 협상 결과:"; _neg -o "$1=$2" | grep -iE 'no matching|Permission denied|Authentication' | head -1; echo ""; }
