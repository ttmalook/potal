# Mock → Real API 전환 계획 (Migration Plan)

원칙: **빅뱅 금지.** Mock을 유지한 채 화면별로 Real adapter를 추가하고 스위치로 전환한다.

---

## 1. 현재 Mock 데이터 위치
- 단일 소스: `src/data/mock.js` (customers, domains, findings/findingDetails, dashboardStats, guides, evidencePacks, reviewQueue, customerView, auditLog, sscPreview …)
- 유일한 fetch 계층: `src/lib/sscApi.js` → 우리 백엔드만 호출.
- 모드 스위치: `VITE_SSC_API_MODE=mock|backend` (기본 mock).

## 2. Real API로 대체할 데이터 (우선순위 순)
| 순서 | 데이터 | Real 소스 | 대체 방식 |
|---|--------|-----------|-----------|
| 1 | Integration Health | `/api/integrations/.../health`,`/probe` | 신규(완료) |
| 2 | Customers 목록 | `GET /portfolios/{id}/companies`, `/all-companies` | adapter |
| 3 | Customer summary | `GET /companies/{id}` | adapter |
| 4 | Factor score | `GET /companies/{id}/factors`,`/summary/factors` | adapter |
| 5 | Active Issues | `GET /companies/{id}/active-issues` | adapter |
| 6 | Risk Finding 상세 | `metadata/issue-types/{type}`+`issues/{type}`+`issue-context` | collector |
| 7 | Report 생성/다운로드 | `POST /reports/*`(dry-run)→`recent`→`files` | 단계적 |
| 8 | Feedback/Validation | `POST .../feedback/validation-request`(dry-run) | 승인 게이트 |

Validation Sandbox / Partner Lab / Audit Log = **SSC 비연동 유지**.

## 3. Mock fallback 유지 여부
- **유지.** 각 데이터 훅은 `mode==='backend'`면 API, 실패 시 Mock 또는 Empty/Error 상태로 graceful degrade.
- 화면은 `app` 훅에서 `{ data, loading, error, source }`를 받도록 확장(현재 `app.findings` 등에 loading/error 필드 추가).

## 4. API 실패 시 UI 상태 (Loading/Error/Empty)
| 상태 | UI |
|------|----|
| Loading | 스켈레톤/스피너 (기존 `ImportProgressPanel` 패턴 재사용) |
| Error | `NoticeBox(danger)` + `errorCode` 메시지 (401→토큰, 403→scope, 404→미등록, 429→잠시 후) |
| Empty | `EmptyState` (예: active-issues 0건) |
| Partial | probe처럼 `warnings[]` 노출(일부 factor/summary 실패) |

## 4b. 1차 Real 연결 대상 확정 (현재 단계)

- **Risk Findings 목록 화면만** Real API 연결 (Mock/Real 토글, 기본 Mock). ✅ 구현·검증 완료
  - route: `GET /api/integrations/securityscorecard/risk-findings/collect` (risk-findings.v1)
  - 상태: Loading / Success / Empty / Scope denied / API error / Rate limited / Mock fallback
  - info-level 이슈: 기본 숨김(토글로 포함), severity 우선 정렬, offset 페이지네이션(더 보기)
- **아직 연결 안 함(이후 단계)**: Finding Detail 상세, Customer Detail 전체, Factor 카드 전환
- **계속 보류(쓰기)**: Report 생성 POST, Validation Request POST, Portfolio 편입 PUT, Followed PATCH, 모든 DELETE

## 5. 화면별 전환 우선순위 (권장 순서)
```
1. Integration Health Check      ← 완료 (probe/health)
2. Customers 목록                 ← 포트폴리오/followed
3. Customer Detail summary        ← score/grade
4. Factor score                   ← factor 카드
5. Active Issues                  ← Risk Finding Import
6. Risk Finding 상세              ← issue collector + metadata
7. Report 생성/다운로드           ← dry-run→실행 승인
8. Feedback/Validation Request    ← 고객 조치 후 SSC 공식 검증
```

## 6. MVP 구현 순서 (스프린트 관점)
- **S1**: Health/Probe 안정화 + `SSC_TEST_DOMAIN`을 in-scope 도메인으로 설정, 401/403/404/429 UX 확정.
- **S2**: Metadata(issue-types/factors) 캐시 + Customers/Customer Detail read-only 연동.
- **S3**: Active Issues → `risk_findings` 정규화 + Finding 상세 collector.
- **S4**: Reports 비동기(recent/files) read-only + Evidence Pack 조회 데이터 연결.
- **S5**: (승인 시) Report 생성 POST 실제화, Validation Request dry-run→실제, Portfolio 편입 PUT.

## 7. 표현/컴플라이언스 가드 (전환 중 유지)
- 파트너 랩 = “참고용 PoC 증적”. 조치 완료/검증 완료 표현 금지.
- 실제 해소는 “SSC 재스캔/공식 Validation 필요”로 표기.
- 고객 화면엔 내부 로그/raw/토큰/디버그 미노출.

## 8. 롤백 전략
- 모드 스위치(`VITE_SSC_API_MODE=mock`)로 즉시 Mock 복귀.
- 화면별 feature flag(예: `VITE_SSC_CUSTOMERS_REAL=true`)로 부분 전환/롤백.
- 백엔드 write/delete는 기본 비활성(env)로 사고 방지.

## 9. Domain/Endpoint 모델 · Validation Sandbox 개선 반영 (2026-07-02)
- **도메인 스코프 분리**: SSC 조회는 `sscLookupDomain`(host), Sandbox/Lab 접속·검증은 `accessUrl`/`serviceEndpoint`(host:port).
  포트(예 `:8443`)는 접속/검증 대상에서 보존. 상세 → [SSC_DOMAIN_SCOPE_MODEL.md](SSC_DOMAIN_SCOPE_MODEL.md).
  - Active Issues 조회(5단계)는 `sscLookupDomain`을 domain 파라미터로 사용.
  - Lab PoC 실행 POST(`/api/lab/runs`)는 `serviceEndpoint/accessUrl/sscLookupDomain`을 함께 전달.
- **Sandbox issue type 카탈로그**: `/metadata/issue-types`의 subset을 `src/data/sandboxCatalog.js`로 구조화.
  드롭다운/Evidence의 단일 소스. 상세 → [SSC_VALIDATION_SANDBOX_ISSUE_TYPES.md](SSC_VALIDATION_SANDBOX_ISSUE_TYPES.md).
  - 실제 metadata 연동 시: 카탈로그 key ↔ SSC issue_type_key 정렬 확인, 미지원 key는 `unsupported` 처리 유지.
- **Evidence 화면**: Issue Summary / Before-After / Target Source·Config Diff / Verification Command / Action Checklist 추가.
  상세 → [SSC_EVIDENCE_SCREEN_REDESIGN.md](SSC_EVIDENCE_SCREEN_REDESIGN.md).
- **보류(쓰기) 정책 불변**: 고객 환경 자동조치·SSC write·Report/Validation/Portfolio/Followed/DELETE 미실행 유지. 마스킹 규칙 유지.

## 10. Mock UI 환경변수 기반 Dev-only 전환 (2026-07-02)
- **Mock Mode 사용자 화면 제거**: Risk Findings의 Mock/Real 토글 제거 → 기본 Real SSC API 고정. Validation Sandbox의 mock 실행 예시는 Developer Samples로 이동.
- **환경변수 게이트**: `VITE_ENABLE_DEV_MOCKS`(기본 false). true일 때만 Developer Mock Samples/수동 Mock 보기 노출. `src/config/runtime.js`의 `ENABLE_DEV_MOCKS` 사용.
- **Mock fallback 금지**: `BACKEND_UNREACHABLE` 시 Mock 자동 대체 대신 `unreachable`(Backend Unavailable) 오류 상태 표시. dev 모드에서만 수동 Mock 보기 버튼.
- **Mock 데이터 보존**: `src/data/mock.js`는 dev-only fixture로 유지(삭제 금지).
- 상세 → [SSC_DEV_MOCKS_POLICY.md](SSC_DEV_MOCKS_POLICY.md), [SSC_UI_MODE_SIMPLIFICATION.md](SSC_UI_MODE_SIMPLIFICATION.md).
- 롤백 전략(§8)과 정합: 이 플래그는 §8의 화면별 feature flag와 별개로 "개발용 Mock 노출"만 제어한다.
