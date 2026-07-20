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
│ VM-DB     │    │ VM-LAB  검증랩 14 컨테이너 │  ⚠️ 의도적 취약 서비스
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

> ⚠️ 랩 타깃 컨테이너들은 호스트 포트를 열지 않습니다(내부 네트워크 전용). 이 상태를 반드시 유지하세요.

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

## 백업 (이중화 대신)

| 대상 | 방법 | 주기 |
|---|---|---|
| **PostgreSQL** | `pg_dump` → VM 외부 저장소 | **1시간** (RPO 1시간) |
| **증적 아티팩트** | `labartifacts` 볼륨 아카이브 | 일 1회 |
| **롤백 지점** | ESXi 스냅샷 | 변경 작업 전 |

```bash
# VM-DB — 시간별 백업 예시 (crontab)
0 * * * * docker exec <db-container> pg_dump -U ssc ssc_portal | gzip > /backup/ssc_$(date +\%Y\%m\%d_\%H).sql.gz
```

> ⚠️ **ESXi 스냅샷은 백업이 아닙니다.** 롤백 지점일 뿐이며, 오래 유지하면 성능이 저하됩니다. 백업은 반드시 VM 외부로 보내세요.

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
