# 포털 화면 ↔ SSC API 매핑 (Portal API Mapping)

각 화면에서 필요한 SSC API와 호출 성격(read-only / dry-run / 비연동)을 매핑한다.
표기: `[R]` 실제 GET · `[dry-run]` 기본 비실행 쓰기 · `[collector]` 공통 수집기 · `[N/A]` SSC 비연동(포털 내부/파트너 랩).

---

## Dashboard
- `GET /portfolios` [R] — 포트폴리오/고객 수 집계
- `GET /companies/{id}` [R] — 대표 고객 score/grade 카드
- `GET /companies/{id}/summary/factors` [R] — Factor 요약
- (집계/큐 카운트는 포털 내부 계산) [N/A]
- (Phase 2) `GET /industries/{industry}/score` — 산업군 벤치마크

## Customers (목록)
- `GET /all-companies` [R] — followed company 목록
- `GET /portfolios/{portfolio_id}/companies` [R] — 포트폴리오 편입 회사
- `GET /all-companies/{domain}` [R] — 개별 존재/메타 확인
- `PATCH /all-companies/{domain}` [dry-run] — 담당자/비즈니스 임팩트 등 메타 수정(추가 아님)

## 고객사 등록 Wizard / Domains & Scope
- `POST /companies/bulk-searches` [R] — 도메인 유효성/후보 확인(선택)
- `GET /all-companies/{domain}` [R] — 이미 followed인지 확인
- `PUT /portfolios/{portfolio_id}/companies/{domain}` [dry-run] — 포트폴리오 편입
- (Phase 2) `POST /parent-domains/{pd}/domains|ips` [dry-run] — 자산 스코프 추가
- (Phase 2) `GET /footprint/{parentDomain}/attribution-log` [R] — 자산 귀속 근거

## Customer Detail
- `GET /companies/{id}` [R] — summary(score/grade)
- `GET /companies/{id}/factors` [R] — factor별 점수/issue count
- `GET /companies/{id}/history/score` [R] — 점수 추이(재스캔 전후)
- `GET /companies/{id}/active-issues` [R] — 활성 이슈 요약
- (Phase 2) `GET /vendor-detection/{domain}/third-party|risk` [R] — 공급망

## Risk Findings (목록)
- `GET /metadata/issue-types` [R] — Issue Type Catalog
- `GET /metadata/factors` [R] — Factor 매핑
- `GET /companies/{id}/active-issues` [R] — Finding Import 핵심 원천
→ 포털 `risk_findings` 모델로 정규화 (source=SecurityScorecard API, workflowState=SSC Risk Imported)

## Finding Detail
- `GET /metadata/issue-types/{type}` [R] — 설명/권고 매핑
- `GET /companies/{domain}/issue-context/{issue_type}` [R] — context 보강
- `GET /companies/{id}/issues/{issue_type}` [collector] — 특정 issue type 상세
- (Phase 2) `GET /companies/{id}/history/events` [R] — 이벤트 타임라인
- 파트너 표준 검증랩 Before/After — **[N/A] SSC 비연동(참고용 PoC)**

## Remediation Guides
- `GET /metadata/issue-types/{type}` [R] — recommendation/description 소스
- (Phase 2) `GET /companies/{domain}/score-plans/by-target-score` [R]
- (Phase 2) `GET /plans` [R] · `POST /plans/issue-resolution` [dry-run]

## Validation Sandbox / Partner Lab
- **[N/A] SSC 비연동.** 파트너 표준 검증랩(자체 Docker/AI) 결과. SSC 대체 아님.

## Evidence Packs
- `GET /companies/{id}` · `/factors` · `/active-issues` [R] — 증적 데이터
- `POST /reports/summary` [dry-run] — 고객 요약 리포트
- `POST /reports/issues` [dry-run] — 이슈 리포트
- `POST /reports/full-scorecard-json` [dry-run] — 전체 동기화
- `GET /reports/recent` [R] — 생성 상태 폴링
- `GET /reports/files/{file_path}` [R] — 산출물 다운로드

## 오탐 / 이의제기 (Finding Detail)
- `POST /companies/{domain}/issues/{type}/feedback` [dry-run] — 오탐/이의제기

## Customer View
- 상기 조회 결과의 **고객 안전 필드만** 파생 [R]
- `POST /companies/{domain}/issues/{type}/feedback/validation-request` [dry-run] — 고객 조치 후 SSC 공식 검증 요청
- 표현 원칙: “SSC 재스캔 필요 / 공식 Validation 요청” (조치 완료 단정 금지)

## Audit Log
- 포털 내부 이벤트 [N/A]
- (Phase 3) `GET /users/by-username/{username}/notifications/recent` [R]

## Compliance View (Phase 3)
- `GET /compliance-frameworks` · `/{key}` [R]
- `POST /reports/compliance/csv/export` [dry-run]

---

## 리포트 비동기 흐름 (Evidence Pack)
```
POST /reports/summary        [dry-run→실행 시]  → report 생성 요청(비동기)
GET  /reports/recent          [R]                → 생성 완료/파일 경로 확인
GET  /reports/files/{path}    [R]                → 다운로드
```
Detailed 등 일부는 별도 rate limit → 429/Retry-After 처리 필수.
