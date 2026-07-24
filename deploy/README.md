# 배포 가이드 — 3-VM 구성 (사내 ESXi)

논리 3티어를 유지하면서, **실질적 근거가 있는 분리만** 물리적으로 나눈 구성입니다.

```
      사내망
        │ 443
┌───────▼─────────────────────────┐
│ VM-APP   web(nginx+SPA)         │  프레젠테이션 + 애플리케이션
│          backend(Express)       │
│          ollama(로컬 LLM)       │
└────┬──────────────────┬─────────┘
     │ 5432             │ 8899
┌────▼──────┐    ┌──────▼──────────────────┐
│ VM-DB     │    │ VM-LAB  검증랩 14 컨테이너 │  주의: 의도적 취약 서비스
│ Postgres  │    │         (격리 필수)        │
└───────────┘    └─────────────────────────┘
```

**왜 이렇게 나눴나**

| 분리 | 근거 |
|---|---|
| **VM-LAB** | 검증랩은 telnet·ftp·약한 SSH·개방 포트 등 **의도적으로 취약한 서비스**를 실제로 띄웁니다. 앱 서버와 동거하면 컨테이너 이탈 시 앱이 직접 노출됩니다. |
| **VM-DB** | 백업·복구를 앱과 독립 수행. 앱 재배포·롤백이 데이터에 영향을 주지 않습니다. |
| web+app 동거 | 사내 전용이라 DMZ 분리 요건이 없습니다. nginx→backend는 컨테이너 레벨로 이미 분리되어 있어(포트 미노출) 물리 분리의 실익이 낮습니다. |

**가용성 방침**: 이중화(HA) 없이 **백업·복구**로 RTO 10분을 충족합니다. 동시 사용자 5명 규모에서 HA는 과설계이며, 구성요소가 늘수록 오히려 복구가 늦어집니다.

---

## VM 사양

| VM | vCPU | RAM | 디스크 | 비고 |
|---|---|---|---|---|
| VM-APP | 4 | 12GB | 60GB | ollama 모델이 RAM 대부분 사용 |
| VM-DB | 2 | 4GB | 40GB | |
| VM-LAB | 4 | 8GB | 80GB | 14 컨테이너 + Playwright(크로미움) |

OS: **Ubuntu Server 22.04/24.04 LTS** 권장. 각 VM에 `docker` + `docker compose` 설치.

---

## 환경변수 (.env) 통합 표

각 VM의 `deploy/` 에서 예시를 복사해 채웁니다 — VM-APP: [`.env.app.example`](.env.app.example), VM-DB: [`.env.db.example`](.env.db.example). (로컬 단일 실행용은 [`backend/.env.example`](../backend/.env.example))

### VM-APP (`deploy/.env`)

| 변수 | 필수 | 기본값 | 설명 |
|---|:--:|---|---|
| `PGHOST` | ✓ | — | VM-DB IP |
| `PGPORT` |  | `5432` | DB 포트 |
| `PGDATABASE` |  | `ssc_portal` | DB 이름(VM-DB와 동일) |
| `PGUSER` |  | `ssc` | DB 사용자(VM-DB와 동일) |
| `PGPASSWORD` | ✓ | — | **VM-DB와 동일 값** |
| `PGSSL` |  | `false` | DB 전송 TLS. 1차 배포 false(방화벽 격리), 이후 인증서 도입 후 true |
| `PGSSL_REJECT_UNAUTHORIZED` |  | `false` | 자체서명 인증서 허용 여부 |
| `LAB_COLLECTOR` |  | `docker` | 수집기 모드 |
| `LAB_COLLECTOR_URL` | ▲ | — | VM-LAB 수집기 `http://<VM-LAB>:8899` (검증랩 사용 시 필수) |
| `AUTH_ACCESS_SECRET` | ✓ | — | JWT 서명 + 설정 암호화 KEK 근원. **기본값이면 부팅 거부**. `openssl rand -base64 48` |
| `SEED_ADMIN_EMAIL` |  | `admin@ssc.local` | 초기 관리자 이메일 |
| `SEED_ADMIN_PASSWORD` | ✓ | — | 초기 관리자 비밀번호. **기본값이면 부팅 거부**. `openssl rand -base64 24` |
| `SERVER_NAME` | ✓ | — | nginx server_name(VM-APP IP/호스트명) |
| `CORS_ORIGIN` | ✓ | — | 허용 오리진 `https://<VM-APP>` |
| `ENABLE_HSTS` |  | `false` | 자체서명 구간은 false, 실인증서 전환 후 true |
| `HSTS_MAX_AGE` |  | `300` | HSTS max-age(초) — 점진 확대 |
| `SSC_API_BASE_URL` |  | `https://api.securityscorecard.io` | SSC API 기준 URL |
| `SSC_API_TOKEN` |  | (빈값) | SSC 토큰. **관리자 화면 설정 권장**(AES-GCM 암호화 저장). env는 폴백 |
| `OLLAMA_MODEL` |  | `exaone3.5:2.4b` | 로컬 LLM 모델(가이드 해석용, 선택) |
| `OLLAMA_TIMEOUT_MS` |  | `90000` | LLM 타임아웃(ms) |

▲ = 해당 기능(검증랩) 사용 시 필수.

### VM-DB (`deploy/.env`)

| 변수 | 필수 | 기본값 | 설명 |
|---|:--:|---|---|
| `PGDATABASE` |  | `ssc_portal` | DB 이름 |
| `PGUSER` |  | `ssc` | DB 사용자 |
| `PGPASSWORD` | ✓ | — | 강한 값으로 교체. **VM-APP와 동일**. `openssl rand -base64 24` |

> **시크릿은 커밋 금지.** `.env`는 `.gitignore` 대상이며, 예시(`*.example`)에는 placeholder만 둡니다. SSC/Claude 키는 가능하면 env 대신 관리자 화면에서 설정(암호화 저장).

---

## 배포 순서

각 단계 완료 후 **ESXi 스냅샷**을 찍어두면 실패 시 즉시 롤백됩니다.

### 1. VM-DB (데이터 티어)

```bash
git clone https://github.com/<계정>/<저장소>.git && cd <저장소>/deploy
cp .env.db.example .env && vi .env          # PGPASSWORD 설정
docker compose -f docker-compose.db.yml --env-file .env up -d
docker compose -f docker-compose.db.yml ps  # healthy 확인
```

방화벽 — **VM-APP 에서만** 5432 허용:
```bash
ufw allow from <VM-APP-IP> to any port 5432 proto tcp
ufw deny 5432
ufw enable
```

### 2. VM-LAB (검증랩)

```bash
git clone ... && cd <저장소>/lab
# postgres 는 VM-DB 와 중복이므로 기동하지 않음
docker compose up -d --build --scale postgres=0
docker compose ps
```

방화벽 — **VM-APP 에서만** 8899 허용. 나머지 전면 차단:
```bash
ufw allow from <VM-APP-IP> to any port 8899 proto tcp
ufw default deny incoming
ufw enable
```

> 주의: 랩 타깃 컨테이너들은 호스트 포트를 열지 않습니다(내부 네트워크 전용). 이 상태를 반드시 유지하세요.

### 3. VM-APP (앱 + 웹)

```bash
git clone ... && cd <저장소>/deploy
cp .env.app.example .env && vi .env         # 시크릿 · VM-DB/VM-LAB 주소
docker compose -f docker-compose.app.yml --env-file .env up -d --build
```

시크릿 생성:
```bash
openssl rand -base64 48    # AUTH_ACCESS_SECRET
openssl rand -base64 24    # SEED_ADMIN_PASSWORD
```

> `NODE_ENV=production` 에서 시크릿이 기본값이면 **backend 가 부팅을 거부**합니다(`assertAuthConfig`). 의도된 안전장치입니다.



### 백업 방식 — DB는 전체, 아티팩트는 증분

| 대상 | 방식 | 근거 |
|---|---|---|
| **DB** | 매회 전체(`pg_dump`) | 덤프가 44KB 수준. 증분(WAL 아카이빙)은 용량이 아니라 RPO를 분 단위로 줄이는 기법이며, 복구가 base+WAL 재생으로 복잡해져 **RTO 10분에 불리**. DB가 수백 MB 이상 되면 재검토 |
| **증적 아티팩트** | **첫 회 전체 → 이후 증분** | 62MB·1,777파일이며 계속 누적. 이미지는 생성 후 변경되지 않아 증분 효율이 매우 높음 |

증분은 `rsync --link-dest` 하드링크 방식이라, **각 스냅샷이 완전한 사본처럼 보이면서** 디스크는 변경분만 사용합니다.
복구도 단순합니다 — 원하는 스냅샷 디렉터리를 그대로 볼륨에 넣으면 됩니다(증분 체인 재생 불필요).

실측: 스냅샷 3개(각 1,776파일) 보관 시 전체 실사용 **71MB** (전체 백업 3회였다면 210MB).

### DB 전송 암호화(PGSSL) 참고

`postgres:16-alpine` 은 **기본적으로 TLS 가 비활성**입니다. 클라이언트가 `PGSSL=true` 로 요청하면
서버가 SSL 을 지원하지 않아 연결이 실패합니다.

- **1차 배포**: `PGSSL=false` (방화벽으로 VM-APP 만 5432 허용 — 격리된 내부 구간)
- **이후 강화**: DB 서버에 인증서를 넣고 `postgresql.conf` 에 `ssl=on` 설정 후 `PGSSL=true` 로 전환

---

## 방화벽 매트릭스

| 출발지 | 목적지 | 포트 | 목적 |
|---|---|---|---|
| 사내망 | VM-APP | 80, 443 | 사용자 접근 |
| VM-APP | VM-DB | 5432 | DB (TLS) |
| VM-APP | VM-LAB | 8899 | 증적 수집기 호출 |
| — | VM-LAB | 그 외 | **전면 차단** (취약 서비스) |
| — | VM-DB | 그 외 | 전면 차단 |

---

## 배포 후 검증 (필수)

`backend/DEPLOY_SECURITY.md` 의 HTTPS 전환 검증 항목입니다.

- [ ] `https://<VM-APP-IP>` 접속 (자체서명 경고 1회 허용)
- [ ] 로그인 성공
- [ ] **새로고침 후 세션 유지** ← refresh 쿠키(`Secure`)가 정상 동작하는지 확인하는 핵심 항목
- [ ] 로그아웃 동작
- [ ] `#share=` 공개 링크가 **로그인 없이** 열림
- [ ] 감사 로그에 `persistence: PostgreSQL` 기록 (파일 폴백이 아님)
- [ ] 검증랩 실행 → 조치 전/후 증적 이미지 표시 (VM-LAB 연동 확인)

DB 연결이 실패하면 backend 는 파일 저장소로 폴백하고 **그 사실을 system 감사 로그에 남깁니다** — 조용히 실패하지 않으니 감사 로그를 확인하세요.

---

## 빌드 · 배포 방식 (CI/CD)

**현재: 수동 배포** — 자동 CI/CD 파이프라인은 두지 않습니다.

```bash
# 코드 갱신 후 재배포(해당 VM의 deploy/ 또는 lab/ 에서)
git pull
docker compose -f docker-compose.app.yml --env-file .env up -d --build web   # 프론트만 재빌드
docker compose -f docker-compose.app.yml --env-file .env up -d --build        # 앱 전체 재빌드
```

- **빌드는 컨테이너 내부에서** 수행됩니다(`--build`). 별도 빌드 서버·아티팩트 저장소가 필요 없습니다.
- **롤백**: 변경 작업 전 ESXi 스냅샷을 찍고, 문제 시 스냅샷 복귀(2~5분). 코드 단위 롤백은 `git checkout <이전 커밋> && ... up -d --build`.
- 배포 후에는 **[RUNBOOK.md](RUNBOOK.md)의 헬스체크·검증**을 수행하세요.

**왜 CI/CD가 없나**: 사내 전용·소규모(동시 5명)이고 배포 빈도가 낮습니다. 수동 배포 + ESXi 스냅샷 롤백으로 RTO 10분을 충족하므로, 파이프라인·러너 운영 비용이 실익보다 큽니다.

**향후 옵션(도입 시)**: GitHub Actions로 **검증만 자동화**(lint·`node --check`·프론트 빌드·OpenAPI 스펙 빌드)하고, 실제 배포는 사내망 접근 문제로 **수동 유지**를 권장합니다. 배포까지 자동화하려면 self-hosted 러너를 사내망에 두고 SSH 배포로 확장할 수 있습니다.

---

## 백업 (이중화 대신)

| 대상 | 방법 | 주기 |
|---|---|---|
| **PostgreSQL** | `pg_dump` → VM 외부 저장소 | **1시간** (RPO 1시간) |
| **증적 아티팩트** | `labartifacts` 볼륨 아카이브 | 일 1회 |
| **롤백 지점** | ESXi 스냅샷 | 변경 작업 전 |

스크립트는 `deploy/backup/` 에 있습니다(실행 검증 완료).

```bash
# VM-DB — 매시 정각 DB 백업
sudo mkdir -p /backup/ssc && sudo chown $USER /backup/ssc
crontab -e
0 * * * * /home/sscdb/portal/deploy/backup/db-backup.sh >> /var/log/ssc-backup.log 2>&1

# VM-LAB — 매일 03:10 증적 아티팩트 백업
sudo mkdir -p /backup/ssc && sudo chown $USER /backup/ssc
crontab -e
10 3 * * * /home/ssclab/portal/deploy/backup/lab-artifacts-backup.sh >> /var/log/ssc-backup.log 2>&1
```

| 스크립트 | 동작 |
|---|---|
| `db-backup.sh` | `pg_dump` → gzip → 크기 검증(실패 덤프 폐기) → 보관주기 초과분 정리 |
| `lab-artifacts-backup.sh` | **첫 회 전체 → 이후 증분**(rsync `--link-dest` 하드링크 스냅샷). 컨테이너 정지 불필요 |
| `restore-db.sh` | 복구. **복구 직전 현재 상태를 먼저 덤프**해 되돌릴 수 있게 함 |

> 백업본은 **VM 밖(NAS·별도 스토리지)으로 주기적으로 복사**하세요. VM이 통째로 손실되면 안에 있던 백업도 함께 사라집니다.

> 주의: **ESXi 스냅샷은 백업이 아닙니다.** 롤백 지점일 뿐이며, 오래 유지하면 성능이 저하됩니다. 백업은 반드시 VM 외부로 보내세요.

### 복구 절차 (RTO 10분)

| 장애 | 조치 | 예상 |
|---|---|---|
| 컨테이너 다운 | `restart: unless-stopped` 자동 복구 | 초 단위 |
| 설정 오류 | ESXi 스냅샷 롤백 | 2~5분 |
| VM 손실 | 백업 VM 부팅 또는 재배포 | 5~10분 |
| DB 손상 | `pg_dump` 복구 | 수 분 |

**배포 완료 후 복구 리허설을 1회 수행하세요.** RTO 10분은 절차가 검증돼 있을 때만 성립합니다.

---

## 운영 메모

- **랩 없이도 포털은 동작합니다.** VM-LAB 장애 시 증적 생성/재촬영만 실패하고 나머지 기능은 정상입니다.
- **ollama 없이도 동작합니다.** 가이드 "쉬운말 해석"만 폴백되고 나머지는 정상입니다.
- 실인증서로 전환 시 `certs` 볼륨에 `fullchain.pem`/`privkey.pem` 을 넣으면 자동 사용되며, HTTPS 정상 확인 후 `ENABLE_HSTS=true` 로 단계적 강화하세요.
  - **공인 CA(Let's Encrypt)**: 표준 포트(80 HTTP-01 / 443 TLS-ALPN-01) 중 하나가 VM-APP 까지 도달해야 함. DNS 를 직접 관리하는 도메인이면 DNS-01(포트 불필요)도 가능.
  - **표준 포트를 다른 서비스가 점유**해 공인 CA 검증이 어려우면 **사내 사설 CA**: [`deploy/certs/make-internal-ca.sh`](certs/make-internal-ca.sh) 로 CA+서버 인증서를 만들고, `ca.crt` 를 접속 PC 신뢰 저장소에 설치하면 경고가 사라집니다.

---

## 인증서 발급·반영·갱신 (Let's Encrypt DNS-01)

표준 포트(80/443)를 다른 서비스가 점유한 환경에서는 **DNS-01**(포트 불필요)로 발급한다.

### 발급 (수동 DNS-01)
```bash
# VM-APP — <domain>·<email> 은 실제 값으로
sudo docker run --rm -it -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --manual --preferred-challenges dns \
  -d <domain> --agree-tos -m <email> --no-eff-email
# → 출력된 TXT 값을 DNS 의 _acme-challenge.<label> 에 등록
# → 권위 네임서버에 값이 보이면(아래 확인) Enter
dig +short TXT _acme-challenge.<label>.<zone> @<권위NS>
```

> **함정 주의(실제 겪은 이슈)**
> - **도메인이 진짜로 그 DNS 를 쓰는지 먼저 확인**: `dig +short NS <domain> @8.8.8.8`. 결과가 `emailverification.info` 류이면 **등록자 이메일 미인증으로 도메인 정지** 상태 → 먼저 **소유자(등록자) 이메일 인증**부터 해야 한다.
> - **네거티브 캐시**: 존재하지 않을 때 조회하면 "없음"이 SOA minimum(예: 86400=24h) 동안 캐시된다. **권위 NS 에 값이 확실히 보인 뒤 Enter**. 성급히 누르면 그 이름이 24시간 잠긴다.

### 반영 (nginx certs 볼륨)
`live/` 는 `archive/` 로의 심링크라 그냥 `docker cp` 하면 깨진다 → 스크립트가 `readlink -f` 로 실파일을 복사한다.
```bash
sudo sh deploy/certs/apply-cert.sh <domain>     # + web 재시작
# 확인
echo | openssl s_client -connect localhost:443 -servername <domain> 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates   # issuer = Let's Encrypt
```
HTTPS 정상 확인 후 `.env` `ENABLE_HSTS=true` 로 강화.

### 갱신 (90일)
`--manual` 인증서는 **자동 갱신되지 않는다.** 만료 전:
```bash
# 1) 위 '발급' 명령을 다시 실행(certbot renew 아님 — manual 은 hook 없이는 재실행) → 새 TXT 등록 → Enter
# 2) 볼륨 반영
sudo sh deploy/certs/apply-cert.sh <domain>
```
- **완전 자동화 옵션**: DNS 를 API 로 제어 가능한 공급자면 `acme.sh --dns <provider>` + install-cert 훅으로 무인 갱신. (공급자 API 키 필요)
- 최소한 **만료일 캘린더 알림**을 걸어둘 것.
