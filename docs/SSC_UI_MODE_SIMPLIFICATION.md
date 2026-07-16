# UI 모드 단순화 — 사용자 화면 3-모드 정리

작성: 2026-07-02 · 관련: [SSC_DEV_MOCKS_POLICY.md](SSC_DEV_MOCKS_POLICY.md)

## 1. 목표

사용자-facing 화면의 데이터 성격을 아래 3가지로만 명확히 표시한다.

| 모드 | 의미 | 사용 화면 |
|------|------|-----------|
| **Real SSC API** | SecurityScorecard read-only 실제 조회값 | Risk Findings, Score, Factors |
| **Partner Lab PoC** | 파트너 표준 검증랩 참고용 PoC 결과 (고객 조치/검증 완료 아님) | Validation Sandbox, Evidence |
| **Template Guidance** | Source/Config Diff · Verification Command · Customer Checklist 등 일반 조치 가이드 | Evidence |

Mock Mode는 사용자 화면에서 제거하고, `VITE_ENABLE_DEV_MOCKS=true`일 때만 개발자용으로 노출.

## 2. 화면별 변경

### Risk Findings
- Mock / Real 토글 제거 → 기본 **Real SSC API** 패널 고정.
- `ENABLE_DEV_MOCKS=true`일 때만 "Real SSC API / Developer Mock" 토글 노출.
- Backend/SSC 실패 시 **Mock fallback 자동 표시 금지** → `unreachable`(Backend Unavailable) 오류 안내.
  - dev 모드에서만 오류 화면에 수동 "Developer: Mock 데이터로 보기" 버튼.

### Validation Sandbox
- 기본: Run Setup + Latest Partner Lab PoC Run + Evidence Detail(Issue Summary / Before-After / Source·Config Fix / Verification / Customer Checklist / Execution Log)만.
- "기존 mock 실행 예시" 테이블/상세는 **Developer Mock Samples**로 이동, dev 모드에서만 라벨과 함께 표시.

### Dashboard
- 요약 지표 위에 **데이터 출처 고지**(등록 수 = in-memory, Risk/재스캔 = Real API 연동 후, 요약 수치는 프로토타입 예시).
- Mock 숫자를 실제 운영 지표처럼 표시하지 않음.

### 공통(App shell)
- 사이드바 배지: "Prototype · Mock Data Only" → "In-memory Prototype · SSC Read-only".
- 검색 placeholder에서 "(mock)" 제거.

## 3. 오류 처리 정책

`false`(기본): API/Backend 실패 → 오류 상태 표시, Mock 자동 대체 금지.
`true`: 오류 화면에 수동 Mock 보기 버튼 제공(자동 아님).

## 3-2. UI 구조 재정렬 반영 (2026-07-02)

- 좌측 메뉴: Remediation Guides를 FINDINGS → **VALIDATION**(Sandbox 뒤)로 이동.
- 공통 패턴 "목록 → row/ID 클릭 → 슬라이드오버 드로어": Domains 상세, Sandbox Evidence 상세, Guide 상세에 공용 `Drawer`.
- 직접 입력(도메인/issue_type)은 dev-only "Developer Direct" 라벨로만 노출. 일반 흐름은 **고객사 → Endpoint → Finding**.
- 각 화면 책임 분리: Dashboard(현황판·액션 제거), Customers(마스터·액션 제거), Domains(Endpoint/Scope), Risk Findings(수집), Sandbox(PoC), Guides(권고), Evidence Packs(패키징 · 전달 포함/제외).
- 상세 계획: [SSC_UI_RESTRUCTURE_IMPLEMENTATION_PLAN.md](SSC_UI_RESTRUCTURE_IMPLEMENTATION_PLAN.md) · [SSC_VALIDATION_SANDBOX_FLOW.md](SSC_VALIDATION_SANDBOX_FLOW.md) · [SSC_REMEDIATION_GUIDES_MODEL.md](SSC_REMEDIATION_GUIDES_MODEL.md).

## 4. 남은 항목

- Evidence Packs 목록에 seed된 프로토타입 Pack의 dev/real 구분 라벨 정교화(후속).
- 상세 화면(Finding/Customer Detail)의 mock 상수 참조는 Real 연동 시 단계적 대체([SSC_MOCK_TO_REAL_API_MIGRATION_PLAN.md](SSC_MOCK_TO_REAL_API_MIGRATION_PLAN.md) §5).
