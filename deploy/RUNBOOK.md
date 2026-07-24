# 운영 · 에러 대응 매뉴얼 (Runbook)

3-VM 배포 환경의 일상 운영·장애 대응 절차. 배포 절차는 [`README.md`](README.md), 보안 게이트는 [`../backend/DEPLOY_SECURITY.md`](../backend/DEPLOY_SECURITY.md).

> 저장소 경로는 VM마다 다를 수 있습니다(예: `~/portal`). 아래 명령의 `<repo>`를 각 VM 실제 경로로 바꿔 실행하세요.
> compose 파일은 **VM-APP=`deploy/docker-compose.app.yml`**, **VM-DB=`deploy/docker-compose.db.yml`**, **VM-LAB=`lab/docker-compose.yml`** 입니다.

---

## 0. 긴급 카드 (한눈에)

| 상황 | 첫 조치 |
|---|---|
| 앱이 안 열림 | VM-APP에서 `docker compose ps` → 죽은 서비스 `restart` (§4) |
| 로그인 후 새로고침 시 로그아웃됨 | refresh 쿠키/HTTPS 문제 → §3 인증 오류 |
| 증적 생성만 실패 | VM-LAB 문제 — 포털 나머지는 정상. §3 랩 |
| "쉬운말 해석"만 실패 | ollama 문제 — 나머지 정상. §3 LLM |
| 데이터가 이상/유실 | 폴백 여부 먼저 확인(§2) → 필요 시 DB 복구(§5) |
| 배포가 부팅 거부/`PGPASSWORD` 오류 | §3 배포·부팅 |

**빠른 헬스체크(VM-APP):**
```bash
curl -sk https://localhost/api/ssc/health            # 앱(백엔드) 응답 확인
cd <repo>/deploy && docker compose -f docker-compose.app.yml ps
```

---

## 1. 로그 확인 (위치 · 명령)

| 대상 | 위치/명령 |
|---|---|
| backend(앱) 로그 | `cd <repo>/deploy && docker compose -f docker-compose.app.yml logs -f --tail=200 backend` |
| nginx(web) 로그 | 동일 compose에서 `... logs -f --tail=200 web` |
| DB 로그 | VM-DB: `docker compose -f docker-compose.db.yml logs -f --tail=200 db` |
| 검증랩 수집기 | VM-LAB: `cd <repo>/lab && docker compose logs -f --tail=200 evidence-collector` |
| **감사 로그**(운영 이벤트) | 앱 내 **감사 로그** 화면(관리자) · API `GET /api/audit?kind=system\|security\|user` · 파일 폴백 시 `backend/data/audit-store.json` |

- 감사 로그의 `system` 종류에서 **`persistence: PostgreSQL`** 인지 확인 — `파일 폴백`이면 DB 연결 실패 상태(§2).
- 로그에 **토큰·비밀번호는 남지 않습니다**(설계상 상태·식별자만). 인증 실패 조사 시 `security` 종류를 보세요.

---

## 2. 상태 · 영속 확인

```bash
# 서비스 상태(각 VM)
docker compose -f docker-compose.app.yml ps        # VM-APP: web, backend (+ollama)
docker compose -f docker-compose.db.yml ps         # VM-DB: db (healthy?)
docker compose ps                                  # VM-LAB: evidence-collector + 타깃

# 앱 헬스
curl -sk https://localhost/api/ssc/health
curl -sk https://localhost/api/integrations/securityscorecard/health
```

- **DB 연결 여부**: 백엔드 부팅 로그에 `PostgreSQL 연결됨` 또는 `파일 저장소 폴백`. 폴백이면 **화면엔 보여도 영구 저장이 안 됩니다** — DB부터 복구(§5) 후 재기동.
- **랩 연동**: 검증랩 실행 시 조치 전/후 이미지가 뜨면 VM-APP→VM-LAB(8899) 정상.

---

## 3. 자주 발생하는 에러 & 해결

### 배포 · 부팅
| 증상 | 원인 | 조치 |
|---|---|---|
| `required variable PGPASSWORD is missing` | 잘못된 compose(루트 올인원) 또는 `.env` 누락 | `deploy/` 에서 **app/db 전용 compose** + `--env-file .env` 로 실행. `.env`에 `PGPASSWORD` 존재 확인 |
| backend가 부팅 즉시 종료(exit 1) | 프로덕션에서 시크릿이 기본값(`assertAuthConfig`) | `AUTH_ACCESS_SECRET`·`SEED_ADMIN_PASSWORD`를 강한 값으로 설정(§README 시크릿 생성) 후 재기동 — **의도된 안전장치** |
| DB 연결 실패 → 파일 폴백 | `PGSSL=true`인데 서버 TLS 미지원 / 방화벽 / 자격증명 | 1차 배포는 `PGSSL=false`(내부 격리 구간). 방화벽 `VM-APP→VM-DB:5432` 확인, `.env`의 `PGHOST/PGPASSWORD` 확인 |

### 인증 · 세션
| errorCode / 증상 | 의미 | 조치 |
|---|---|---|
| 새로고침 시 로그아웃 | refresh 쿠키(`Secure`) 미동작 — HTTP 접속 등 | **HTTPS로 접속**. nginx 인증서·`Secure` 쿠키 확인 |
| `REFRESH_REUSE` | refresh 재사용 감지 → family 전체 폐기 | 정상 보안 동작. 사용자 **재로그인**. 반복되면 토큰 탈취 의심 → `security` 감사 확인 |
| `REFRESH_EXPIRED` / `NO_REFRESH` | 세션 만료/쿠키 없음 | 재로그인 |
| `BAD_CREDENTIALS` | 이메일/비밀번호 불일치 | 입력 확인. 분실 시 관리자 재설정(`PATCH /api/auth/users/{id}/password`) |
| `LAST_ADMIN` | 마지막 관리자 강등/삭제 차단 | 다른 관리자를 먼저 승격 후 진행 |
| `RATE_LIMITED` | 요청 과다(공개 링크·수집 등) | 잠시 후 재시도. 지속 시 출처 확인 |

### SSC 연동
| errorCode | 의미 | 조치 |
|---|---|---|
| `SSC_TOKEN_MISSING` | SSC API 토큰 미설정 | 관리자 화면에서 토큰 설정(`PUT /api/settings/ssc-token`) 또는 `backend/.env` 폴백 |
| `SSC_UNAUTHORIZED` / `SSC_FORBIDDEN` | 토큰 무효/권한 부족 | 토큰 재발급·권한 확인 |
| `SSC_SCOPE_DENIED` / `SSC_SCOPE_HINT` | 조회 범위 밖 도메인 | 대상 도메인이 SSC 포트폴리오/권한 범위인지 확인 |
| `SSC_RATE_LIMITED` | SSC 측 레이트리밋 | 잠시 후 재시도 |
| `SSC_NETWORK_ERROR` / `SSC_UPSTREAM_ERROR` | SSC API 통신 장애 | 외부 연결(egress)·SSC 상태 확인 |

### 검증랩 · LLM (기능 저하, 포털은 정상)
| errorCode / 증상 | 의미 | 조치 |
|---|---|---|
| 증적 생성/재촬영 실패 | VM-LAB 다운 또는 8899 차단 | VM-LAB `docker compose ps`·수집기 로그, 방화벽 `VM-APP→VM-LAB:8899` 확인 |
| `INTERPRET_FAILED` | 가이드 "쉬운말 해석" LLM 실패 | ollama 상태 확인. 실패해도 원문 가이드는 표시됨 |
| `CLAUDE_NOT_CONFIGURED` | Lab Builder용 Claude 키 미설정 | 관리자 화면에서 Claude 키 설정(선택 기능) |
| `GATE_FAILED` / `ADOPT_BLOCKED` | 레시피 게이트 미통과/채택 차단 | 정상 품질 게이트. 레시피 재생성 또는 수동 검토 |

> 위 표에 없는 `WEAK_PASSWORD`·`SAME_PASSWORD`·`DUPLICATE`·`BAD_INPUT` 등은 **사용자 입력 검증(400)** 으로 클라이언트에 그대로 안내됩니다(운영 조치 불필요).

---

## 4. 재시작 절차

```bash
# 전체(해당 VM) 재기동 — 무중단에 가깝게 재생성
cd <repo>/deploy && docker compose -f docker-compose.app.yml --env-file .env up -d      # VM-APP
cd <repo>/deploy && docker compose -f docker-compose.db.yml --env-file .env up -d       # VM-DB
cd <repo>/lab    && docker compose up -d                                                # VM-LAB

# 개별 서비스만 재시작
docker compose -f docker-compose.app.yml restart backend      # 앱만
docker compose -f docker-compose.app.yml restart web          # nginx만

# 코드 변경 반영(재빌드)
docker compose -f docker-compose.app.yml --env-file .env up -d --build web
```

- 컨테이너는 `restart: unless-stopped` 라 크래시 시 자동 복구(초 단위).
- 설정 오류로 꼬이면 **ESXi 스냅샷 롤백**(2~5분)이 가장 빠릅니다.

---

## 5. 백업 & 복구

상세 정책·cron 등록은 [`README.md` §백업](README.md)에. 스크립트는 [`deploy/backup/`](backup/).

```bash
# 수동 DB 백업(VM-DB)
sh <repo>/deploy/backup/db-backup.sh                 # pg_dump→gzip→크기검증→보관주기 정리

# DB 복구(VM-DB) — 복구 직전 현재 상태를 먼저 덤프해 되돌릴 수 있음
sh <repo>/deploy/backup/restore-db.sh                # 인자 없이 실행 → 사용 가능한 백업 목록
sh <repo>/deploy/backup/restore-db.sh /backup/ssc/ssc_YYYYMMDD_HHMM.sql.gz

# 증적 아티팩트 백업(VM-LAB) — 첫 회 전체→이후 증분(하드링크)
sh <repo>/deploy/backup/lab-artifacts-backup.sh
```

**복구 목표(RTO 10분) — 장애별 조치:** 컨테이너 다운=자동복구 / 설정 오류=스냅샷 롤백 / VM 손실=재배포 / DB 손상=`restore-db.sh`.

> 주의: 백업본은 **VM 밖(NAS 등)으로 주기 복사**. ESXi 스냅샷은 백업이 아니라 롤백 지점입니다.

---

## 6. 정기 점검 체크리스트

- [ ] (일) 감사 로그 `system`에 `PostgreSQL` 영속 유지 확인(폴백 아님)
- [ ] (일) 백업 로그(`/var/log/ssc-backup.log`)에 최신 백업 성공 기록
- [ ] (주) 최신 백업본이 VM 외부 저장소로 복사됐는지
- [ ] (주) 디스크 여유(특히 VM-LAB 아티팩트·백업 보관)
- [ ] (월) 인증서 만료일 확인(실인증서 전환 시)

---

## 7. 배포 후 1회 리허설 (초안 — 실서버에서 완료 필요)

> RTO 10분은 절차가 **검증돼 있을 때만** 성립합니다. 배포 후 아래를 1회 수행하고 결과를 기록하세요.

- [ ] `db-backup.sh` 수동 실행 → 백업 파일 생성·크기 검증 확인
- [ ] cron 등록(VM-DB 매시, VM-LAB 매일) 후 다음 주기 자동 백업 1건 확인
- [ ] **복구 리허설**: 테스트 데이터 변경 → `restore-db.sh`로 이전 백업 복구 → 롤백 확인(소요 시간 기록)
- [ ] 증적 아티팩트 백업 1회 실행 → 스냅샷 디렉터리를 볼륨에 넣어 복구되는지 확인
- [ ] 컨테이너 강제 종료(`docker kill`) → `unless-stopped` 자동 복구 확인
- [ ] 결과(소요 시간·이슈)를 이 문서 하단 또는 별도 기록에 남김
