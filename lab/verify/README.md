# 수동 검증 하니스 (Manual Verification Harness)

자동화(collector)가 만드는 증적이 **진짜인지 사람이 독립적으로 확인**하기 위한 스크립트 모음입니다.
자동화 코드를 호출하지 않고, 컨테이너에 **실제 명령**을 직접 날려 실제 운영자 조치를 재현합니다.

## 개념

각 이슈 타입마다 두 스크립트:

- `reproduce.sh` — **취약점 환경을 실제로 생성**하고(설정을 취약하게 변경 + reload) 취약함을 확인
- `remediate.sh` — **실제 조치를 적용**(운영자와 동일한 설정 수정 + reload)하고 검증:
  1. **취약 해소** — 취약점이 실제로 사라졌는가
  2. **웹 서비스 무해** — 조치 후에도 사이트가 정상(200 + 본문)인가 ← 조치가 서비스를 깨지 않았는지

`reproduce`가 매번 취약 베이스라인을 새로 세우므로 (reproduce → remediate) 쌍은 반복 가능(멱등)합니다.

## 실행

```sh
cd claude/lab
docker compose up -d                       # drill 타깃 포함 랩 기동
sh verify/verify.sh x_content_type_options_incorrect_v2   # 특정 이슈
sh verify/verify.sh --all                  # 전체
```

스크립트는 가변(drill) 타깃 컨테이너 **안에서** 실행됩니다(`docker compose exec`). 랩 타깃은 내부
네트워크(labnet)라 호스트에서 직접 접근하지 않습니다.

## 구조

```
verify/
  verify.sh                     # 러너(사람이 실행) — reproduce→remediate 순차 실행 + PASS/FAIL 요약
  issues/
    _lib.sh                     # 공통 assert 헬퍼(reset/reload/header·cookie·redirect·site_ok)
    <issue_type>/
      meta.json                 # 카테고리·타깃·focus 헤더·조치 내용·헬스 체크
      reproduce.sh              # 취약 환경 생성 + 취약 assert
      remediate.sh              # 실제 조치 + ①해소 assert ②웹 무해 assert
```

## 커버리지

- **http_header — 10/10 완료** (`lab-http-drill`): x_content_type_options · hsts · x_frame_options ·
  x_xss_protection · csp(no_policy·too_broad·unsafe) · cookie(HttpOnly·Secure) · insecure_https_redirect
- **tls — 9/9 완료** (`lab-tls-drill`): weak_protocol · weak_cipher · cert(expired · self_signed ·
  key_size · weak_signature · excessive_expiration · no_revocation · revoked)
- **dns — 9/9 완료** (`lab-dns-drill`): spf(missing·softfail·wildcard·malformed) ·
  dmarc(missing·contains_none·subdomain) · dkim(weak_signature·insufficient_key_length)
- **ssh — 2/2 완료** (`lab-ssh-drill`): weak_cipher(3des-cbc→AEAD/CTR) · weak_protocol(dh-group14-sha1→curve25519)
- **network — 20/20 완료** (`lab-net-drill`): 서비스 포트 노출→차단 (telnet·ftp·rdp·vnc·smb·
  mysql·redis·mongodb·elasticsearch·couchdb·cassandra·ldap·imap·dns·pptp·http_proxy·open_port 등)

**전체 5개 카테고리 = SSC 지원 검증랩 50종 전부 · `sh verify/verify.sh --all` → PASS 50 · FAIL 0**

## 가변 타깃

- `lab-http-drill`(nginx) · `lab-tls-drill`(nginx+openssl) · `lab-dns-drill`(dnsmasq) · `lab-ssh-drill`(openssh) · `lab-net-drill`(socat)
- 각 카테고리 스크립트는 해당 drill 컨테이너 안에서 실행되며 meta.json 의 `target` 으로 verify.sh 가 자동 선택.

## 자동 게이트와의 관계

`backend/scripts/labValidationGate.mjs`(자동, collector **출력** 검사)와 **별개**입니다. 이 하니스는
컨테이너를 직접 찔러 **전제(취약/조치가 실제로 성립)** 를 사람이 확인하는 독립 검증입니다.
