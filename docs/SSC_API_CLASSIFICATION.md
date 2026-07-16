# SSC API 분류 (Classification)

기준 문서: `SSC_API_URL_Inventory_v1.md` (총 219 URL / 28 그룹).
분류 라벨: **MVP** · **Phase 2** · **Phase 3** · **Common Collector** · **Dry-run only** · **Excluded**

판단 기준(핵심 흐름):
`고객사 등록 → score/factor/active-issue 수집 → Risk Finding 정규화 → 조치 가이드/Evidence Pack → 고객 검토 → SSC 재스캔/공식 Validation`

---

## 1. 그룹별 분류 요약

| 그룹 | 대표 Endpoint | 활용 화면 | R/W/D | MVP | 위험도 | 주의사항 |
|------|---------------|-----------|-------|-----|--------|----------|
| Metadata | `GET /metadata/issue-types`, `/metadata/factors`, `/metadata/issue-types/{type}` | Risk Findings, Guides | R | ✅ MVP | 낮음 | issue type을 enum 하드코딩 금지, 이걸로 catalog 동기화 |
| Company Scorecard | `GET /companies/{id}`, `/summary/factors`, `/factors`, `/history/score` | Dashboard, Customer Detail | R | ✅ MVP | 낮음 | id=domain\|scorecard_id, scope 없으면 403/404 |
| Findings | `GET /companies/{id}/active-issues`, `/issue-context/{type}` | Risk Findings/Detail | R | ✅ MVP | 중간 | Import 핵심, 페이지네이션 |
| Issue Type Details (75) | `GET /companies/{id}/issues/{issue_type}` | Finding Detail | R | ✅ **Common Collector** | 중간 | 개별 API 하드코딩 금지 → 공통 수집기 |
| Historical Issue Details (35) | `GET /companies/{id}/history/events/{date}/issues/{type}` | Finding 회귀분석 | R | **Common Historical Collector** | 중간 | Phase 2 회귀분석용, 공통화 |
| Followed Companies | `PATCH/DELETE /all-companies/{domain}`, bulk | Customers | R/**W/D** | ✅ MVP(읽기)/⚠️(쓰기) | 높음 | PATCH=메타수정(추가 아님), 존재확인 선행. DELETE/bulk 주의 |
| Portfolio | `GET/POST/PUT/DELETE /portfolios`, `/portfolios/{id}/companies` | Customers, Wizard | R/**W/D** | ✅ MVP(읽기) | 높음 | 편입은 PUT companies/{domain}; DELETE 금지 |
| Reports | `GET /reports/recent`, `/files/{path}`, `POST /reports/*` | Evidence Pack, Customer View | R/**W** | ✅ MVP(recent/files) / ⚠️ dry-run(POST) | 중간 | 생성 비동기, 별도 rate limit, 429 처리 |
| Feedback / Validation | `POST /companies/{domain}/issues/{type}/feedback[/validation-request]` | Finding Detail, Customer View | **W** | ⚠️ MVP 후보(dry-run) | 높음 | 고객 조치 후 SSC 공식 검증 요청, 실제 제출 신중 |
| Company Search | `POST /companies/bulk-searches` | Wizard(도메인 확인) | R(검색) | MVP 후보 | 낮음 | 대량 등록 전 검증 |
| Vendor Detection | `GET /vendor-detection/{domain}/third-party` 등 | Supply Chain | R | Phase 2 | 낮음 | 공급망 확장 |
| Footprint / Attribution / Assets | `GET /footprint/{pd}/attribution-log`, `POST .../domains|ips` | Domains & Scope, Finding 근거 | R/W | Phase 2 | 중간 | 자산 추가는 Write |
| History Events / Expanded Risk | `GET /companies/{id}/history/events`, `/expanded-risk` | Finding 근거, 타임라인 | R | Phase 2 | 낮음 | — |
| ASI (Details/Search) | `POST /asi/search`, `GET /asi/details/*` | 고급 분석 | R/W(search) | Phase 2/3 | 중간 | CVE/Threat/Ransomware 상세 |
| Improvement Planning | `GET /companies/{domain}/score-plans/by-target-score` | Guides | R | Phase 2 | 낮음 | — |
| Plans | `GET /plans` + `POST/PATCH/DELETE ...` | Guides, Review | R/**W/D** | Phase 2(읽기만) | 높음 | POST/PATCH/DELETE는 dry-run/제외 |
| Multiscore | `GET /multiscores/{id}` 등 | 벤치마크 | R | Phase 2/3 | 낮음 | — |
| Industry Benchmark | `GET /industries/{ind}/score` | Dashboard 비교 | R | Phase 3 | 낮음 | — |
| IP/Domain Tags (+Groups) | `.../ip-domain-tags/*` | 자산 태깅 | R/**W/D** | Phase 2/3 | 중간 | 태깅 운영 기능 |
| Custom Scorecards | `.../custom-scorecards/*` | 커스텀 평가 | R/**W/D** | Phase 3 | 중간 | — |
| Compliance | `GET /compliance-frameworks` | Compliance View | R | Phase 3 | 낮음 | — |
| Notifications / Notes / Invitations | 각 1 | 알림/메모/협업 | R/W | Phase 3 | 낮음 | — |
| Apps / Jobs | `POST/PUT /apps/{id}/jobs` | 커넥터 | W | Phase 3 | 중간 | 외부 앱 작업 |
| Integration / SSO | `GET /v1/saml/metadata/...` | SSO | R | Phase 3 | 낮음 | — |

---

## 2. Common Collector로 묶는 대상 (하드코딩 금지)

- **Issue Type Details 75개** + active-issues → 단일 함수:
  `getIssueDetails(scorecardId, issueType)` = `GET /companies/{id}/issues/{issue_type}`
- **Historical Issue Details 35개** → `getHistoricalIssue(scorecardId, effectiveDate, issueType)`
- issue_type 목록은 **`GET /metadata/issue-types`**로 동적 확보 → enum 박제 금지.
- `insecure_ftp`, `open_port`, `malware_detected`, `potentially_vulnerable*` 등은 전용 함수를 만들지 않는다.

---

## 3. Dry-run only (기본 비실행)

이번 단계에서 **실제 호출하지 않음** (설계/코드는 두되 기본 dry-run):

- `PUT /portfolios/{id}/companies/{domain}` (편입)
- `PATCH /all-companies/{domain}` (followed 메타 수정)
- `POST /reports/summary | /reports/issues | /reports/full-scorecard-json | /reports/detailed` 등
- `POST /companies/{domain}/issues/{type}/feedback[/validation-request]`
- `POST /plans/*` (issue-resolution/factor/overall)

## 4. Excluded / DELETE (절대 실제 실행 금지, 이번 단계)

- 모든 `DELETE *` (portfolios/companies, all-companies, plans, custom-scorecards, tags …)
- `POST /all-companies/bulk-delete`, `POST /all-companies/bulk-update` (대량 위험)
- Apps/Jobs, SSO, Custom Scorecards write, IP/Domain Tag write → 포털 MVP 범위 밖.

---

## 5. MVP 확정 (12 read-only)

```
1  GET /portfolios
2  GET /portfolios/{portfolio_id}/companies
3  GET /all-companies
4  GET /all-companies/{domain}
5  GET /companies/{scorecard_identifier}
6  GET /companies/{scorecard_identifier}/summary/factors
7  GET /companies/{scorecard_identifier}/factors
8  GET /metadata/factors
9  GET /metadata/issue-types
10 GET /metadata/issue-types/{type}
11 GET /companies/{scorecard_identifier}/active-issues
12 GET /reports/recent
```

### MVP 후보(실제 호출 주의 · 기본 dry-run)
```
PUT   /portfolios/{portfolio_id}/companies/{domain}
PATCH /all-companies/{domain}
POST  /reports/summary
POST  /reports/issues
POST  /reports/full-scorecard-json
POST  /companies/{domain}/issues/{type}/feedback/validation-request
```
