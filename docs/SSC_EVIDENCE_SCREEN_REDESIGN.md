# Evidence 화면 재설계 — 실무형 Evidence / Remediation Guidance

작성: 2026-07-02 · 관련 코드: `src/features/Lab.jsx` (`LabEvidenceView`, `ConfigDiff`, `subCmd`), `src/App.css`

## 1. 목표

기존 Evidence는 Before/After 스크린샷 + Technical Diff + 조치 방향 텍스트에 그쳤다.
고객이 **어디를(파일/설정) 어떻게(diff) 바꾸고, 무엇으로(명령) 검증**하는지 실무적으로 전달하도록 재설계.

## 2. 섹션 구성 (`LabEvidenceView`)

| # | 섹션 | 내용 | 출처 |
|---|------|------|------|
| Header | Partner Lab PoC Evidence — {issue_type} | Run ID, Target Endpoint(accessUrl), SSC Lookup Domain, Collector, Status 배지 | run + catalog |
| ① | **Issue Summary** | 왜 문제인지(why), factor / severity / category 칩 | `catalogEntry.why` |
| ② | **Before / After Evidence** | 재현/조치 시연 스크린샷(실제 캡처 우선, 없으면 placeholder) | run.evidence.visual_* |
| ③ | **Target Source / Config + Diff** | 조치 위치 목록(whereToChange) + `ConfigDiff`(+/- 라인) | `catalogEntry.whereToChange`, `configDiff` |
| ④ | **Technical Diff** | 수집기가 관측한 헤더/스캔 결과 diff (기존 유지) | run.evidence.technical_diff |
| ⑤ | **Verification Command** | curl/dig/openssl/nmap — `{host}/{port}/{endpoint}` 치환 | `catalogEntry.verification` |
| ⑥ | 일반 조치 방향(참고) | 백엔드 guide (기존 유지) | run.guide |
| ⑦ | **Customer Action Checklist** | 조치 위치 체크 + 재검증 명령 + SSC 재스캔 확인 | catalog + 고정 항목 |
| Footer | Validation Note (노란 박스, 유지) | "Not Customer Environment Validation" | run.note |

## 3. ConfigDiff 컴포넌트

- 입력: `{ label, file, lines:[{t, s}] }` — `t`는 `ctx`(컨텍스트) / `add`(+) / `del`(-).
- 렌더: gutter(+/-/공백) + 텍스트, add=녹색 / del=적색 / ctx=회색. 다크 배경 코드블록.
- **참고용 스니펫**임을 전제 — 실제 파일 라인수/경로는 고객 환경마다 다름.

## 4. 명령 치환 (`subCmd`)

```
{host}     → run.sscLookupDomain || run.domain
{port}     → run.port || serviceEndpoint의 포트 || 443
{endpoint} → run.serviceEndpoint || accessUrl에서 스킴 제거
```
예: `nmap --script ssl-enum-ciphers -p {port} {host}` → `... -p 8443 gateway.example.com`

## 5. issue_type별 템플릿

카탈로그 각 항목이 자체 `why / whereToChange / configDiff / verification`을 보유 → issue_type마다
Evidence 섹션이 자동으로 다르게 렌더된다(별도 컴포넌트 분기 불필요).

예시:
- **hsts_incorrect** → nginx `add_header Strict-Transport-Security ...` diff + `curl -I`.
- **cookie_missing_http_only** → Set-Cookie(값 마스킹) `HttpOnly` 추가 diff + devtools 확인.
- **spf_record_missing** → zone file TXT 레코드 추가 diff + `dig TXT {host}`.
- **tls_weak_protocol** → nginx `ssl_protocols TLSv1.2 TLSv1.3;` diff + `nmap ssl-enum-ciphers`.
- **open_port** → 방화벽 `{port}/tcp filtered` diff + `nmap -p {port} {host}`.

## 5-2. Evidence 상세 = 슬라이드오버 드로어 (2026-07-02 UI 재정렬)

- Evidence 상세는 메인 화면 인라인/탭이 아니라 **우측 대형 슬라이드오버(`Drawer`, 폭 ~78%)**로 표시.
  Validation Sandbox 최근 실행 목록의 `Evidence 보기`에서 오픈(`EvidenceDrawer`).
- 상단 sticky header(제목/서브/badge) + 본문 섹션 세로 스크롤 + 하단 sticky action bar.
- 하단 액션: [Evidence 후보로 저장] [Evidence Pack Draft에 추가] [Remediation Guide 보기] [닫기].
  **고객 전달 버튼은 두지 않는다**(Customer View 소관). 검수/승인 단계는 폐지됨.
- 섹션 순서: Run Summary → Issue Summary → Before/After → Source/Config Change → Technical Diff → Verification Command → 일반 조치 방향 → Customer Action Checklist → Validation Note → Execution Log.
- 관련 흐름: [SSC_VALIDATION_SANDBOX_FLOW.md](SSC_VALIDATION_SANDBOX_FLOW.md).

## 6. 컴플라이언스 / 마스킹 준수

- raw cookie 값·전체 URL·IP·issue_id·scorecardId **미노출** (Set-Cookie는 `***` 마스킹).
- "고객 환경 검증 완료" 류 표현 금지 → Header/Footer 모두 "참고용 PoC · SSC 재스캔 필요" 유지.
- Evidence Pack 첨부 시에도 동일 뷰(`LabEvidenceView`) 재사용 → C 영역 일관성.
