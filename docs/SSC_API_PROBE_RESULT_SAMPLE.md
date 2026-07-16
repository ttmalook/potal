# SSC API Probe 결과 샘플 (실측)

본 문서는 `GET /api/integrations/securityscorecard/probe` 를 **실제 SecurityScorecard API에 read-only(GET)로** 호출한 결과다.
(백엔드 `.env`에 유효 토큰이 설정된 상태에서 실행. 토큰 값은 응답/로그 어디에도 포함되지 않음.)

- 실행 방식: read-only GET 9종만. 쓰기/삭제 없음.
- 테스트 도메인: `SSC_TEST_DOMAIN=example.com` (기본값)

---

## 1. Health

```json
GET /api/integrations/securityscorecard/health
{
  "ok": true,
  "baseUrl": "https://api.securityscorecard.io",
  "tokenConfigured": true,
  "testDomain": "example.com",
  "writeTestsEnabled": false,
  "deleteTestsEnabled": false
}
```

## 2. Probe (요약 결과 — 실측)

```json
GET /api/integrations/securityscorecard/probe
{
  "ok": true,
  "baseUrl": "https://api.securityscorecard.io",
  "tokenConfigured": true,
  "testDomain": "example.com",
  "writeTestsEnabled": false,
  "deleteTestsEnabled": false,
  "checks": [
    { "name": "portfolios",          "endpoint": "GET /portfolios",                          "status": 200, "ok": true,  "entryCount": 2 },
    { "name": "allCompaniesByDomain","endpoint": "GET /all-companies?domain={domain}",        "status": 200, "ok": true,  "entryCount": 0 },
    { "name": "followedCompany",     "endpoint": "GET /all-companies/{domain}",               "status": 404, "ok": false, "errorCode": "SSC_NOT_FOUND" },
    { "name": "companySummary",      "endpoint": "GET /companies/{domain}",                   "status": 403, "ok": false, "errorCode": "SSC_FORBIDDEN" },
    { "name": "companyFactors",      "endpoint": "GET /companies/{domain}/factors",           "status": 403, "ok": false, "errorCode": "SSC_FORBIDDEN" },
    { "name": "metadataFactors",     "endpoint": "GET /metadata/factors",                     "status": 200, "ok": true,  "factorCount": 12 },
    { "name": "metadataIssueTypes",  "endpoint": "GET /metadata/issue-types",                 "status": 200, "ok": true,  "issueTypeCount": 241 },
    { "name": "activeIssues",        "endpoint": "GET /companies/{domain}/active-issues",     "status": 403, "ok": false, "errorCode": "SSC_FORBIDDEN" },
    { "name": "reportsRecent",       "endpoint": "GET /reports/recent",                       "status": 200, "ok": true,  "reportCount": 0 }
  ],
  "warnings": [
    { "name": "followedCompany", "errorCode": "SSC_NOT_FOUND" },
    { "name": "companySummary",  "errorCode": "SSC_FORBIDDEN" },
    { "name": "companyFactors",  "errorCode": "SSC_FORBIDDEN" },
    { "name": "activeIssues",    "errorCode": "SSC_FORBIDDEN" },
    { "name": "scopeHint", "errorCode": "SSC_SCOPE_HINT",
      "message": "example.com이(가) Followed/Portfolio에 없을 수 있습니다. 먼저 Portfolio에 회사를 추가해야 할 수 있습니다." }
  ],
  "errors": []
}
```

---

## 3. 해석

| 결과 | 의미 |
|------|------|
| ✅ **토큰 유효** | `portfolios`(2), `metadata/factors`(12), `metadata/issue-types`(**241**), `reports/recent`(0) 모두 200 |
| ✅ **Metadata 연동 확정** | issue-types 241개 확보 → **Issue Type Catalog 동적 구성 방식이 실제로 동작** (하드코딩 불필요) |
| ⚠️ **example.com이 scope 밖** | company summary/factors/active-issues 가 **403**, followed 조회가 **404** |
| ✅ **scope hint 정상 동작** | example.com이 Portfolio/Followed에 없음을 자동 안내 |
| ✅ **errors 0** | 토큰/네트워크/5xx 오류 없음 → 인증·연결 자체는 정상 |

핵심: **인증과 metadata read는 성공**, 회사별 데이터는 **테스트 도메인이 고객 포트폴리오에 편입되어 있지 않아** 접근 불가(정상적인 권한 보호 동작).

---

## 4. 권장 조치

1. `backend/.env`의 `SSC_TEST_DOMAIN`을 **실제 포트폴리오에 편입된 고객 도메인**으로 변경 후 재실행.
   - 그러면 `companySummary`(score/grade), `companyFactors`, `activeIssues`가 200으로 전환될 것으로 예상.
2. 편입 회사가 없다면(현재 all-companies 0건), 먼저 Portfolio에 회사를 추가해야 함
   - 편입 API `PUT /portfolios/{id}/companies/{domain}`는 **쓰기이므로 기본 dry-run** (SSC_ENABLE_WRITE_TESTS로만 실제화).
3. MVP 연동은 metadata + 편입된 도메인의 summary/factors/active-issues부터 시작.

---

## 5. 안전 확인 (example.com run)
- 실행된 호출: **GET 9종만.** POST/PUT/PATCH/DELETE **없음.**
- 응답/로그에 **토큰 미포함**(마스킹 로직 + summary-only 반환).
- `writeTestsEnabled=false`, `deleteTestsEnabled=false` 로 쓰기/삭제 경로 비활성.

---

# 재실행 — 실제 in-scope 도메인 (acme.com)

`GET /portfolios` → `GET /portfolios/{id}/companies` 로 실제 편입 도메인을 확인한 뒤 `SSC_TEST_DOMAIN=acme.com`으로
변경하고 read-only probe를 재실행했다. (GET only, 토큰 미노출)

- 사용 도메인: **acme.com** (회사명: Acme Electronics Co., Ltd.)
- 포함 Portfolio: **demo-commerce** (`00000000-0000-0000-0000-000000000000`), 총 N개사
- (다른 포트폴리오 `ed8682c1-…`는 회사 0개)

## R1. Probe 요약 (실측)

| Check | Endpoint | Status | 결과 |
|-------|----------|:---:|------|
| portfolios | `GET /portfolios` | 200 | entryCount 2 |
| allCompaniesByDomain | `GET /all-companies?domain=` | 200 | entryCount 1 |
| followedCompany | `GET /all-companies/{domain}` | 200 | found=true, "Acme Electronics Co., Ltd." |
| companySummary | `GET /companies/{domain}` | 200 | **score 97 / grade A**, scorecardId `1f5b48a7-…`, industry technology |
| companyFactors | `GET /companies/{domain}/factors` | 200 | **factorCount 10** |
| metadataFactors | `GET /metadata/factors` | 200 | 12 |
| metadataIssueTypes | `GET /metadata/issue-types` | 200 | **241** (필드: key/severity/factor/title) |
| activeIssues | `GET /companies/{domain}/active-issues?issue_types=…` | 200 | issue_types **필수**, 배치 ≤10, sampled 10 → 응답 envelope 스키마 확인 필요 |
| reportsRecent | `GET /reports/recent` | 200 | 0 |

`ok: true`, warnings 0, **errors 0**.

## R2. example.com vs acme.com 비교

| Check | example.com | acme.com |
|-------|:---:|:---:|
| portfolios | 200 (2) | 200 (2) |
| allCompaniesByDomain | 200 (0) | 200 (1) |
| followedCompany | **404** | **200** |
| companySummary | **403** | **200 (97/A)** |
| companyFactors | **403** | **200 (10)** |
| metadataFactors | 200 (12) | 200 (12) |
| metadataIssueTypes | 200 (241) | 200 (241) |
| activeIssues | **403** | **200** (issue_types 필수) |
| reportsRecent | 200 (0) | 200 (0) |
| **종합** | scope 밖(403/404) | **in-scope 정상** |

→ **차이의 원인은 권한이 아니라 scope.** 도메인이 포트폴리오에 편입되어야 회사별 데이터가 열린다.

## R3. metadata issue-types(241) ↔ active-issues 연결 방식 (확인됨)

- `metadata/issue-types` 엔트리 = `{ key, severity, factor, title }`. **`key`가 issue type 식별자** (예: `api_key_exposed`, `adware_installation`).
- `active-issues`는 **`issue_types` 쿼리 파라미터가 필수** (없으면 400: "must contain at least one issue type").
- **요청당 issue_types 개수 제한 존재**: 10개 → 200, 25개 → 400.
- 따라서 전체 Finding 수집 흐름:
  ```
  GET /metadata/issue-types            → 241개 key 카탈로그 확보
  key[]를 ≤10개 배치로 분할
  각 배치: GET /companies/{domain}/active-issues?issue_types=k1&issue_types=k2...
  결과 병합 → risk_findings 정규화
  ```
- 단, active-issues 응답 엔벨로프(현재 run에서 error-keyed로 관측, acme 등급 A라 sampled types 활성 이슈 없음 추정)는 **정식 스키마 확인 후** Finding 파서를 확정해야 함.

## R4. 안전 확인 (acme.com run)
- 실행 호출: **GET only** (portfolios, all-companies, companies summary/factors, metadata, active-issues, reports/recent).
- **PUT/POST/PATCH/DELETE, bulk, report 생성, feedback/validation 모두 미실행.**
- 토큰: 응답/로그/문서/`.env.example` 어디에도 값 없음. `SSC_TEST_DOMAIN` 라인만 편집(토큰 라인 미열람).
- `git status`에 `backend/.env` 미노출(ignored 확인).

---

# active-issues 스키마 확정 (read-only)

`factors[].issue_summary`로 활성 issue type을 도출한 뒤 active-issues를 호출해 정상 envelope를 확인했다.
(대상: 포트폴리오 내 최저 점수 도메인 `***.kr`, score 49 / grade F — **마스킹**. 고객 원본 값 미기록.)

## S1. 확인 결과 요약
- active-issues 정상 envelope = **`{ total_active_issues, issue_types[] }`** (`entries` 아님).
- `issue_types[]` = `{ name, issues_count, issues[] }`; `issues[]` = `{ issue_id, url, domain, group_status, first_seen_time, last_seen_time, sources[], observations[], issue_count }`.
- `observations[]` 스키마는 issue type별 상이(cookie 계열: `{cookie_name, raw_cookie, last_seen_at}`).
- **Empty = 200 + `{error:{statusCode:404}}`** (요청 타입이 활성 아님 → 오류 아님).
- **효율 발견**: `factors[].issue_summary[]` 가 이미 `{type,count,severity,total_score_impact,detail_url}` 제공 → 241 blind scan 불필요.

## S2. 실제 active issue 존재 확인 (***.kr)
- `total_active_issues` = **18** (요청 6개 타입 기준), 활성 issue type 예: `typosquat`(8), `hsts_incorrect_v2`(3), `cookie_missing_http_only`(2), `tls_weak_protocol`(2), `service_dns`(2), `spf_record_missing`(1) 등.
- acme.com(등급 A)은 sampled 타입에서 활성 이슈 없음 → 정상(고보안 도메인).

전체 스키마/매핑은 `SSC_ACTIVE_ISSUES_SCHEMA_REVIEW.md`, `SSC_RISK_FINDING_NORMALIZATION_PLAN.md` 참고.

## S3. 안전 확인 (schema run)
- 실행: GET only (portfolios/companies, factors, active-issues). 쓰기/삭제/리포트/피드백 없음.
- 고객 도메인/URL/관측 원본 값은 문서에 **마스킹**(`***.kr`)으로만 기록. 원본 응답 전체 미저장.

---

# Collector Route 테스트 (read-only, 화면 미연결)

`GET /api/integrations/securityscorecard/risk-findings/collect?domain={domain}` — 정규화 요약(마스킹)만 반환.

## T1. 결과 요약 (실측)

| 케이스 | 대상 | ok | activeTypeCount | normalizedFindingCount | returned | errors |
|--------|------|:--:|:---:|:---:|:---:|--------|
| 활성 이슈 있음(고득점) | ***.com (score 97/A) | true | 9 | **44** | 20(capped) | — |
| 활성 이슈 있음(저득점) | ***.kr (score 49/F) | true | 10 | **22** | 20(capped) | — |
| Scope 밖 | ***.com (example) | false | 0 | 0 | 0 | `SSC_FORBIDDEN` |
| 순수 Empty(0건) | — | (해당 없음) | — | — | — | 포트폴리오 내 0-이슈 도메인 부재 |

- **주의**: 등급 A(97)도 info severity 이슈(service_cloud_provider, tls_ocsp_stapling, spf_softfail 등) 44건 보유 → 포트폴리오에 "활성 0" 도메인이 없어 순수 empty 케이스는 실도메인으로 재현 불가.
- **Empty 처리 경로는 검증됨**: active-issues 배치의 `{error:404}` 엔벨로프는 빈 배치로 스킵, 활성 type 0이면 `ok:true, normalizedFindingCount:0`. Scope-out은 `ok:false + errors[]`로 무중단 처리.

## T2. Normalized Finding 샘플 (마스킹)
```jsonc
{
  "finding_id": "ssc:masked",
  "issue_type": "cookie_missing_http_only",
  "issue_title": "Session Cookie Missing 'HttpOnly' Attribute",
  "factor": "application_security",
  "severity": "high",
  "status": "active",
  "asset_type": "url",
  "asset_value": "https://***.kr/…",
  "first_seen": "2026-05-13",
  "last_seen": "2026-06-29",
  "evidence_summary": "observations: 3, sources: 1",
  "recommendation_summary": "- Include the HTTP-only attribute when setting the session cookie. …"
}
```

## T3. 안전 확인 (collector run)
- GET only. 쓰기/삭제/리포트/피드백/bulk **미호출**.
- 응답에 실제 domain/url/ip/cookie/issue_id/scorecardId **미노출**(마스킹·요약·최대 20건).
- 저득점 도메인은 요청 URL에만 사용하고 로그/문서엔 미기록(마스킹).
