# SSC Partner Portal — UI 구조 재정렬 구현 계획

> ✅ **상태: 구현 완료** (2026-07-02 계획) · 본 문서는 완료된 재정렬의 이력입니다.
> §1 "문제점"은 모두 **해결된 과거 항목**이며 현재 화면에는 나타나지 않습니다.
> 이후 변경: 파트너 검수 폐지 · 관리 그룹(사용자 관리·랩 스튜디오) 추가 · 고객 전달 리포트 v2(조치 전후 증거).

작성: 2026-07-02 · 목적: 기능 추가가 아닌 상용 솔루션 관점의 UI 일관성/정보구조/업무흐름 정리

## 1. 현재 화면별 문제점

| 화면 | 문제 |
|------|------|
| 전체 | 화면마다 다른 UX 패턴(직접입력 / 우측 고정 패널 / 내부 탭·긴 펼침). "목록→선택→상세 팝업/드로어" 미통일 |
| Dashboard | 실행 액션(고객사 등록/Risk 가져오기/검수 대기) 중복 배치 — 현황판인데 다른 메뉴 업무를 노출 |
| Customers | "고객 액션"(도메인 등록/SSC Risk 가져오기/Findings·Evidence 보기)이 다른 메뉴 책임을 침범 |
| Domains & Scope | row에 수정/삭제 버튼 상시 노출, 스크린샷/HAR 체크박스 노출(민감), 상세 팝업 없음 |
| Risk Findings | 도메인 직접 입력 방식(개발자형). 고객사/등록 Endpoint 기반이 아님 |
| Validation Sandbox | issue_type/endpoint 직접 선택(개발자형). Evidence 상세를 메인에 길게 펼침 |
| Remediation Guides | FINDINGS 그룹에 위치(단계 순서 오류). 우측 고정 패널. 상태 "Validated"(검증완료 오해) |
| Evidence 상세 | 메인 화면 인라인/탭. 별도 대형 팝업/슬라이드오버 아님 |

## 2. 최종 화면별 역할

- **Dashboard** = 운영 현황 요약(현황판, 실행 액션 없음)
- **Customers** = 고객사 마스터(등록/조회/기본정보). 도메인·수집·Evidence 액션 없음
- **Domains & Scope** = 고객별 serviceEndpoint / sscLookupDomain / accessUrl / 허용·제외 / 동의 관리. row-click 상세 드로어
- **Risk Findings** = 고객사 선택 → 등록 Endpoint 선택 → sscLookupDomain 기준 SSC Read-only 수집
- **Validation Sandbox** = 고객사 → Endpoint → Risk Finding 선택 → Partner Lab PoC 실행 → 최근 실행 목록. Evidence는 드로어
- **Remediation Guides** = (VALIDATION 그룹) 고객사 기반 Guide 목록 → Guide 상세 드로어
- **Evidence Packs** = Draft Pack 구성
- ~~**Partner Review** = 전달 전 검수/승인/수정요청~~ → **이후 폐지**: 검수 단계 제거, 증적 팩은 기본 전달 포함(전달에서 제외만 선택), 고객 전달 화면 미리보기가 최종 확인
- **Customer View** = 전달/열람
- **Audit Log** = 이력

## 3. 좌측 메뉴 최종 구조

```
OVERVIEW  → Dashboard
SCOPE     → Customers, Domains & Scope
FINDINGS  → Risk Findings
VALIDATION→ Validation Sandbox, Remediation Guides, Evidence Packs
DELIVERY  → Customer View, Audit Log        (Partner Review 이후 폐지)
```
변경점: `guides`를 FINDINGS → VALIDATION(Sandbox 뒤, Evidence 앞)으로 이동. crumb도 `Validation / Remediation Guides`.

## 4. 공통 패턴 · 신규 공용 컴포넌트

- **Drawer**(slide-over, 우측, 폭 ~78%, dim, sticky header/footer, 본문 세로 스크롤, 섹션형) → `common.jsx`.
  Domains 상세, Sandbox Evidence 상세, Guide 상세에 공용 사용.
- **고객사→Endpoint 선택기**: Risk Findings / Validation Sandbox에서 `app.customers` + `app.domains`(고객 필터) 기반 select.
  - API 조회는 `sscLookupDomain`, 접속/검증·PoC는 `serviceEndpoint`/`accessUrl`.
- 직접 입력(도메인/issue_type)은 `ENABLE_DEV_MOCKS=true`에서만 "Developer Direct" 라벨로 노출.

## 5. 수정 대상 파일

| 파일 | 변경 |
|------|------|
| `src/App.jsx` | NAV 그룹(guides 이동), PAGE_META crumb |
| `src/components/common.jsx` | Drawer 컴포넌트 추가 |
| `src/pages/Pages.jsx` | Dashboard 액션 제거 / Customers 액션 제거 / Domains 드로어·컬럼·체크박스 / RiskFindings 래퍼 / ValidationSandbox 재구성 / RemediationGuides 재구성 |
| `src/features/SscApi.jsx` | RiskFindingsRealPanel: 고객사/Endpoint 컨텍스트 수용, 직접입력 dev-only |
| `src/features/Lab.jsx` | ValidationSandboxRealPanel: 고객/Endpoint/Finding 기반 실행, Evidence 드로어 분리 |
| `src/features/Registration.jsx` | DomainModal: 스크린샷/HAR 체크박스 제거, 하단 위험 액션(제거) |
| `src/App.css` | Drawer/picker 스타일 |
| `docs/*` | 아래 §7 |

## 6. 구현 순서

1. 좌측 메뉴(guides → VALIDATION) + crumb
2. Mock dev-only 재확인(이미 적용됨: `ENABLE_DEV_MOCKS`)
3. Dashboard 상단 액션 3종 제거
4. Customers "고객 액션" 제거(+ `+ 고객사 등록` 유지)
5. Domains: 관리 컬럼 제거, row-click 상세 드로어, 스크린샷/HAR 체크박스 제거, 삭제는 드로어 하단 위험 액션
6. Risk Findings: 고객사→Endpoint 선택 후 sscLookupDomain 수집, 직접입력 dev-only
7. Validation Sandbox: 고객사→Endpoint→Finding→PoC 실행, 최근 실행 목록만, 직접선택 dev-only
8. Evidence 상세 Drawer 분리(Sandbox/Guide 공용)
9. Remediation Guides: 고객사 기반 목록 + Guide 상세 드로어 + 상태 문구 변경
10. 문서 + 빌드 + 브라우저 회귀 테스트

## 7. 영향 범위 / 테스트 계획

- 영향: 라우팅/데이터 모델 불변(포트 보존·domainScope 유지). 화면 레이아웃/상호작용만 변경.
- 금지: SSC write/Report POST/Validation POST/Portfolio PUT/Followed PATCH/DELETE, DB 연결, Mock 삭제, collector 내부 대규모 변경, 고객환경 자동수정.
- 테스트: `false`/`true` 두 상태에서 각 화면 §19 체크리스트, 8443 포트 보존, 금지 표현 부재, 콘솔 에러 0, 빌드 성공.

## 8. 상태/문구 정책

- Guide 상태: `Validated → Guide Reviewed(검토 완료)`, `In Review → Reviewing(검토 중)`, `Draft → 초안`.
- Evidence 상태 흐름: Draft Evidence → Evidence Candidate → Added to Evidence Pack Draft. (Pending Partner Review 단계 이후 폐지)
- 금지 표현: 조치 검증 완료 / 고객 환경 해결 확인 / 취약점 제거·해결 완료 / Sandbox 검증 완료 / 고객 환경에서 확인 완료.
- 허용: Partner Lab PoC Evidence / 참고용 증적 / Draft Evidence / 일반 조치 권고 / Not Customer Validation / SSC 재스캔·공식 Validation 필요.

## 관련 문서
[SSC_UI_MODE_SIMPLIFICATION.md](SSC_UI_MODE_SIMPLIFICATION.md) · [SSC_DEV_MOCKS_POLICY.md](SSC_DEV_MOCKS_POLICY.md) · [SSC_DOMAIN_SCOPE_MODEL.md](SSC_DOMAIN_SCOPE_MODEL.md) · [SSC_VALIDATION_SANDBOX_FLOW.md](SSC_VALIDATION_SANDBOX_FLOW.md) · [SSC_EVIDENCE_SCREEN_REDESIGN.md](SSC_EVIDENCE_SCREEN_REDESIGN.md) · [SSC_REMEDIATION_GUIDES_MODEL.md](SSC_REMEDIATION_GUIDES_MODEL.md) · [SSC_MOCK_TO_REAL_API_MIGRATION_PLAN.md](SSC_MOCK_TO_REAL_API_MIGRATION_PLAN.md)
