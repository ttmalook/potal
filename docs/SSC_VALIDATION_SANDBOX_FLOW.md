# Validation Sandbox — 운영 흐름 (고객사/Endpoint/Finding 기반)

작성: 2026-07-02 · 관련 코드: `src/features/Lab.jsx` (`ValidationSandboxRealPanel`, `EvidenceDrawer`), `src/components/common.jsx` (`CustomerEndpointSelect`, `Drawer`)

## 1. 역할

Validation Sandbox = **선택된 고객사의 Risk Finding에 대해 Partner Lab PoC를 실행하고 Evidence 후보를 생성**하는 작업 화면.
issue_type/endpoint 직접 선택(개발자형)은 일반 화면에서 제거하고, **고객사 → 등록 Endpoint → Risk Finding** 기반으로 실행한다.

## 2. 메인 화면 흐름

```
1) 고객사 선택          (app.customers)
2) 등록 Endpoint 선택    (app.domains · 고객 필터) → serviceEndpoint / accessUrl / sscLookupDomain 표시
3) Risk Finding 불러오기 → collectRiskFindings(sscLookupDomain)  (Real SSC API · Read-only)
4) Risk Finding 선택     (issue_type — title — severity)
5) Sandbox 지원 상태      → catalogEntry(issue_type) 로 지원/미지원 판정
6) 표준 검증랩 PoC 실행    → runLabPoC({ issueType, serviceEndpoint, accessUrl, sscLookupDomain })
7) 최근 실행 목록         → 상세는 인라인이 아니라 Evidence 드로어로
```

- **API 조회**: `sscLookupDomain`(host). **접속/검증·PoC**: `serviceEndpoint`/`accessUrl`(host:port, 포트 보존).
- PoC 실행 후 메인에는 상세를 펼치지 않고 실행 결과 목록만 갱신(토스트 안내).

## 3. Sandbox 지원 상태

- 지원: Template(category) / Collector / Evidence Mode / severity 칩 표시 → 실행 버튼 활성.
- 미지원: "현재 Partner Lab PoC 템플릿이 없는 issue type입니다. 일반 Remediation Guide만 제공할 수 있습니다." → 실행 비활성.

## 4. 최근 실행 목록 컬럼

`Run ID · Endpoint · Issue Type · Collector · 상태 · Evidence 상태 · 상세(Evidence 보기)`

Evidence 상태: **Draft Evidence → Evidence Candidate → Added to Evidence Pack Draft**. (검수 대기 단계 폐지)

## 5. Evidence 상세 (드로어)

`Evidence 보기` → 우측 슬라이드오버(`Drawer`, 폭 ~78%). 탭이 아니라 섹션형 문서 레이아웃(세로 스크롤).
- 상단 badge: Partner Lab PoC / Draft Evidence / Not Customer Validation / Template Guidance / Read-only.
- 섹션: Run Summary · Issue Summary · Before/After · Source/Config Change(+Diff) · Technical Diff · Verification Command · 일반 조치 방향 · Customer Action Checklist · Validation Note · Execution Log.
- 하단 액션: [Evidence 후보로 저장] [Evidence Pack Draft에 추가] [Remediation Guide 보기] [닫기].
  - **고객 전달 버튼 없음** — 전달·확인은 Customer View 소관. 검수/승인 단계는 폐지됨.

## 6. Developer Direct Run (dev-only)

`VITE_ENABLE_DEV_MOCKS=true`에서만 issue_type·endpoint 직접 지정 실행 노출(명확한 라벨). 일반 운영 흐름 아님.

## 7. 금지/컴플라이언스

- 고객환경 검증·조치완료 표현 금지. 실제 해소는 SSC 재스캔/공식 Validation.
- raw cookie/full URL/IP/issue_id/scorecardId 미노출(마스킹). 포트(8443) 접속/검증에서 보존.
