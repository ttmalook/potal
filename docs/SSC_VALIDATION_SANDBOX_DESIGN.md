# Validation Sandbox (Partner Lab PoC) 설계

목적: Risk Finding의 **issue_type**을 당사 **표준 검증랩**에서 재현하고, **일반 조치 방향**을 적용해
**Before/After 참고 증적(스크린샷 + 기술 diff) + 조치 가이드**를 생성한다.

## 0. 컴플라이언스 원칙 (변하지 않음)
- 파트너 표준 검증랩 결과 = **참고용 PoC 증적**. **고객 운영환경 검증/조치 완료가 아님.**
- 랩은 **당사 격리 환경**에서만 실행. 고객 도메인/자산에 **절대 접근하지 않음**.
- 고객 환경의 실제 해소는 **SecurityScorecard 재스캔/공식 Validation**으로 확인.
- 금지 표현("조치 완료/검증 완료") 유지. 사용 표현: "일반 조치 방향 시연", "참고용 PoC", "SSC 재스캔 필요".

---

## 1. 핵심 통찰 — 이슈 유형마다 증적 방식이 다르다

"React 웹에 취약점을 심고 Before/After 스크린샷"은 **HTTP/웹 헤더 계열**에만 잘 맞는다.
실제 도메인의 findings(PPTP, SPF, TLS 인증서)는 웹 페이지가 아니라 **네트워크/DNS/TLS** 계열이라
브라우저 스크린샷으로는 재현/증적이 안 된다. → **카테고리별 재현 타깃 + 증적 수집기**가 필요.

### 증적 통일 아이디어
모든 카테고리가 **동일한 증적 형태**를 갖도록 한다:
```
Evidence = { visual_before, visual_after, technical_diff, guide }
```
- `visual_*` = 스크린샷. **웹 계열**은 실제 페이지, **네트워크/DNS/TLS 계열**은 스캔 결과를
  깔끔한 HTML 리포트로 렌더링한 화면을 스크린샷(→ 어떤 카테고리든 Before/After 시각 증적 확보).
- `technical_diff` = 헤더 diff / nmap diff / dig diff / openssl diff 등 원본 기술 근거.
- `guide` = `metadata/issue-types/{type}`의 일반 권고(이미 collector가 확보) + 랩 재현/조치 요약.

---

## 2. 이슈 카테고리 ↔ 랩 템플릿 ↔ 증적 매핑

| 카테고리 | 예시 issue_type | 재현 타깃(vulnerable→remediated) | 증적 수집기 | technical_diff |
|----------|-----------------|----------------------------------|-------------|----------------|
| **HTTP/웹 헤더** | hsts_incorrect_v2, csp_no_policy_v2, cookie_missing_http_only, x_powered_by, mixed_content | 웹앱(nginx/React): 헤더 누락 → 헤더 적용 | Playwright(브라우저) | 응답 헤더 diff + 스크린샷 |
| **TLS/인증서** | tlscert_excessive_expiration, tlscert_no_revocation, tls_weak_cipher/protocol, insecure_server_certificate_key_size | TLS 서비스(nginx): 취약 cert/cipher → 적합 cert/cipher | openssl/testssl + 리포트 렌더 | s_client/인증서 속성 diff |
| **DNS/이메일** | spf_record_missing, dmarc_record_missing, dkim_record_missing | DNS 존(coredns/bind): 레코드 없음 → 레코드 추가 | dig + 리포트 렌더 | TXT/DNS 레코드 diff |
| **네트워크 서비스** | service_pptp, open_port, insecure_telnet, insecure_ftp, service_rdp | 서비스 컨테이너: 포트 노출 → 차단/제거 | nmap + 리포트 렌더 | 포트/서비스 상태 diff |

- issue_type(241개) → **카테고리** → **랩 템플릿**으로 축약(개별 하드코딩 금지, 매핑 테이블로 관리).
- 매핑에 없는 type → `unsupported`(수동 PoC 안내). 로그로 남겨 템플릿 확장 백로그로.

> 이번 실도메인 findings 매핑 예:
> `service_pptp`→네트워크, `spf_record_missing`→DNS, `tlscert_*`→TLS. (전부 스캔형 증적)

---

## 3. 아키텍처 (Docker Compose)

```
                    ┌────────────────────────── portal backend (기존 Express) ──────────────┐
Risk Finding ──▶ "표준 검증랩 PoC 실행" ──▶ POST /api/lab/runs { issueType, findingRef }      │
                    │      │                                                                  │
                    │      ▼                                                                  │
                    │  lab-orchestrator (신규 서비스)                                          │
                    │   1) issueType→template 매핑                                            │
                    │   2) docker compose up (vulnerable, remediated)  [격리 네트워크]         │
                    │   3) evidence-collector 실행 (Before/After)                             │
                    │   4) diff 계산 + artifact 저장(volume)                                   │
                    │   5) compose down (teardown)                                            │
                    │   6) lab_run/artifact를 lab-db에 기록 → Evidence Pack 후보 생성          │
                    └────────────────────────────────────────────────────────────────────────┘
   컨테이너들 (per-run, 격리):
     vulnerable-target  ─┐   evidence-collector (Playwright + 스캐너: nmap/openssl/dig)
     remediated-target  ─┘   report-renderer (스캔결과→HTML→스크린샷)
   저장:
     lab-db (Postgres 또는 SQLite)   artifact-store (volume: png/har/json)
```

- **격리**: 전용 Docker 내부 네트워크. 외부/고객 도메인 egress 차단(스캐너는 랩 타깃만 대상).
- **일시성**: run 단위로 컨테이너 생성→수집→파괴. 아티팩트만 영속.
- **오케스트레이터**: 기존 backend를 확장하거나 별도 서비스로. Docker 제어는 `dockerode`(Node) 또는 compose CLI.

---

## 4. 실행 플로우 (1 finding)

```
1. Risk Findings/Detail에서 finding 선택 → "표준 검증랩 PoC 실행"
2. orchestrator: issueType→template(category) 결정 (없으면 unsupported 응답)
3. vulnerable/remediated 타깃 기동
4. evidence-collector:
   - Before: 타깃(취약) 상태 캡처 (웹=스크린샷+헤더 / 스캔=nmap|dig|openssl → 리포트 렌더 → 스크린샷)
   - After:  타깃(조치) 상태 캡처
5. diff 계산(헤더/포트/레코드/인증서), guide 조합(metadata 권고 + 재현/조치 요약)
6. Evidence(visual_before/after + technical_diff + guide) 생성 → Partner Lab PoC Evidence
7. teardown, lab_run 저장, Evidence Pack에 첨부 가능 상태로
8. 포털: Validation Sandbox 상세 / Finding Detail C영역 / Evidence Pack에 표시
   (전부 "참고용 PoC" 배지 + "SSC 재스캔 필요" 고지)
```

---

## 5. 데이터 모델 (lab-db)

```
lab_template(
  id, category,              -- http_header | tls | dns | network
  title, issue_types[],      -- 매핑되는 issue_type 목록
  vulnerable_ref, remediated_ref,  -- compose 서비스/이미지/설정 참조
  evidence_mode,             -- web_screenshot | scan_report
  guide_id
)
lab_run(
  id, finding_ref, issue_type, template_id, category,
  status,                    -- queued|running|succeeded|failed|unsupported
  started_at, ended_at,
  diff_summary,              -- 요약 텍스트
  evidence_pack_id           -- 연결
)
artifact(
  id, run_id, kind,          -- visual_before|visual_after|headers_before|headers_after|scan_before|scan_after|har
  path, sha256, captured_at
)
remediation_guide(
  issue_type, general_direction, steps[], pre_checks[], service_impact, cautions[]
  -- 초기값은 SSC metadata/issue-types/{type} 권고에서 시드
)
```
- 포털 저장소(현재 파일→Postgres 승격)와 **같은 Postgres** 사용 권장(운영 단순화).

---

## 6. AI Browser Agent 역할

- **핵심**: Playwright(headless) 자동화 = 페이지 접속/스크린샷/응답 헤더·쿠키·콘솔·HAR 수집.
- **스캔형**: nmap/openssl/dig 실행 → 결과를 report-renderer가 HTML로 렌더 → Playwright가 그 리포트를 스크린샷(= visual 증적).
- **"AI" 부분(선택)**: LLM으로 (a) diff를 사람이 읽는 evidence 노트로 요약, (b) 조치 가이드 문구 정리.
  - 초기엔 mock/규칙 기반으로 대체 가능(외부 AI 호출 없이). 이후 옵션으로 켜기.
- **안전**: Agent는 **랩 타깃만** 접속. 고객 도메인/외부 접속 없음.

---

## 7. 기술 스택 제안

| 구성 | 권장 | 비고 |
|------|------|------|
| 오케스트레이터 | 기존 Node/Express 확장(+ `dockerode`) 또는 별도 FastAPI | 기존 백엔드 재사용이 단순 |
| 취약/조치 웹 타깃 | nginx(정적) 또는 소형 React/Express | 헤더 계열은 nginx conf 하나로 충분 |
| TLS/DNS/네트워크 타깃 | nginx(TLS), coredns(DNS), 소형 서비스 컨테이너 | openssl/dig/nmap로 검증 |
| 증적 수집 | **Playwright** + nmap/openssl/dig | 통일된 스크린샷 확보 |
| 리포트 렌더 | 소형 HTML 템플릿 서버 | 스캔결과→시각화 |
| DB | **PostgreSQL**(포털과 공용) 또는 SQLite(MVP) | 포털 DB 승격과 함께 |
| 아티팩트 | Docker volume → 이후 S3 호환 스토리지 | png/har/json |

> 사용자 아이디어(React + 간단 DB + 일부러 만든 취약점)는 **HTTP/웹 헤더 카테고리**에 그대로 적용됨.
> 나머지 카테고리는 서비스 컨테이너 + 스캐너로 확장.

---

## 8. 단계별 구현 계획

- **Phase A — 설계/매핑(현재 문서)**: 카테고리·템플릿·증적·데이터 모델 확정. issue_type→template 매핑표 초안.
- **Phase B — MVP 1~2 템플릿 (Docker 최초)**:
  - (B1) HTTP 헤더 템플릿 1개(예: `hsts_incorrect` 또는 `cookie_missing_http_only`) — 웹 스크린샷 + 헤더 diff.
  - (B2) 스캔형 템플릿 1개(예: `spf_record_missing` 또는 `tls_weak_cipher`) — 스캔 리포트 스크린샷 + diff.
  - orchestrator API(`POST /api/lab/runs`, `GET /api/lab/runs/:id`) + lab-db + Playwright collector.
  - 포털 Finding Detail "표준 검증랩 PoC 실행" → 실제 run 호출 → 결과 표시(mock 대체).
- **Phase C — Evidence Pack 연동**: run 결과를 Evidence Pack(C영역)로 첨부, "참고용 PoC/재스캔 필요" 고지 유지.
- **Phase D — 템플릿 확장**: TLS/DNS/네트워크 전 카테고리, 매핑 테이블 확대.
- **Phase E — AI 요약(옵션)**: LLM으로 evidence 노트/가이드 자동 정리(켬/끔 스위치).

각 Phase 종료 시: 실행 안전(격리/무egress), 증적 마스킹, "조치 완료" 표현 부재를 점검.

---

## 9. 포털 UI 연결점 (이미 존재하는 자리)

- **Finding Detail C영역** "표준 검증랩 PoC 실행" 버튼 → 실제 orchestrator 호출(현재 mock toast).
- **Validation Sandbox** 화면 → lab_run 목록/상세(로그·Before/After·diff), 상단 "고객환경 검증 아님" 고지 유지.
- **Evidence Packs** → Partner Lab PoC Evidence(Before/After + diff + guide) 첨부.
- 상태: 기존 워크플로우 `Partner Lab PoC Ready` → `Evidence Pack Review Required` … `SSC Re-scan Required` 흐름에 연결.

---

## 10. 리스크 / 유의

- **비웹 이슈의 "스크린샷"**: 스캔 리포트 렌더로 해결(모든 카테고리 시각 증적 통일).
- **Docker-in-backend 보안**: 오케스트레이터에 도커 제어 권한 → 격리/권한 최소화 필수.
- **재현 정확도**: 랩은 "issue_type의 일반적 형태" 재현이지 고객 환경 복제가 아님(문구로 명확화).
- **리소스**: run마다 컨테이너 기동/파괴 → 동시 실행 수 제한, 큐잉 필요.
