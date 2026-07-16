# active-issues 응답 스키마 리뷰 (Schema Review)

read-only GET로 확인한 `GET /companies/{scorecard_identifier}/active-issues` 의 요청 조건과 응답 구조.
(고객 값은 마스킹. 원본 응답 전체는 저장하지 않고 필드/구조만 기록.)

---

## 1. 요청 조건 (확정)

| 항목 | 값 |
|------|----|
| Method | `GET` (read-only) |
| Path | `/companies/{scorecard_identifier}/active-issues` |
| identifier | primary **domain** 사용 가능 (예: summary/factors와 동일) |
| **필수 파라미터** | **`issue_types`** — 최소 1개. 없으면 `400 "The issue_types query parameter is required and must contain at least one issue type"` |
| 파라미터 형식 | `issue_types` 반복(`?issue_types=a&issue_types=b`) 정상 동작 |
| **배치 크기 제한** | **10 → 200 OK**, **25 → 400** (요청당 issue_types 개수 상한 존재) |
| 권장 배치 | **≤ 10** |

issue_types 값 = `metadata/issue-types`의 **`key`** (예: `hsts_incorrect_v2`, `cookie_missing_http_only`, `typosquat`).

---

## 2. 정상 응답 (활성 이슈 있음)

HTTP 200. 최상위 = `{ total_active_issues, issue_types[] }` (`entries` 아님에 주의).

```jsonc
{
  "total_active_issues": <number>,          // 요청한 issue_types 기준 활성 finding 총합 (예: 18)
  "issue_types": [
    {
      "name": "cookie_missing_http_only",   // = issue type key
      "issues_count": <number>,             // 이 타입의 finding 수
      "issues": [                           // ← 실제 finding 배열
        {
          "issue_id": "<uuid>",
          "url": "https://***.kr/...",      // 영향 자산(URL)
          "domain": "***.kr",               // 영향 도메인
          "group_status": "active",
          "first_seen_time": "2026-05-13T01:08:12.000Z",
          "last_seen_time":  "2026-06-29T04:39:19.997Z",
          "sources": [ ... ],               // 탐지 소스 (배열)
          "observations": [                 // ← 증적(스키마는 issue type마다 다름)
            { "cookie_name": "...", "raw_cookie": "...", "last_seen_at": "..." }
          ],
          "issue_count": <number>
        }
      ]
    }
  ]
}
```

- **finding 공통 필드**: `issue_id, url, domain, group_status, first_seen_time, last_seen_time, sources[], observations[], issue_count`.
- **`observations[]` 스키마는 issue type별로 상이** (cookie 계열: `{cookie_name, raw_cookie, last_seen_at}`; 네트워크 계열은 ip/port 계열 필드 예상). → 정규화 시 **원본 값 저장 금지, 필드/건수 요약만**.
- severity/factor는 finding에 없음 → `metadata/issue-types` 또는 `factors[].issue_summary`에서 보강.

---

## 3. Empty 응답 (요청한 타입이 활성 아님)

HTTP **200** 이지만 body가 error 엔벨로프:

```jsonc
{ "error": { "statusCode": 404, "message": "..." } }
```

- 즉, **200 + `{error:{statusCode:404}}` = "요청한 issue_types 중 활성인 것이 없음"**. 오류가 아니라 "빈 결과"로 취급해야 함.
- acme.com(등급 A) 및 score 49 도메인 모두, **알파벳 앞쪽 241개 중 임의 타입**을 넣으면 이 엔벨로프가 반환됨(그 타입들이 해당 도메인에 없기 때문).

---

## 4. Error 응답

| 상황 | HTTP | body |
|------|:---:|------|
| `issue_types` 누락 | 400 | `{error:{statusCode:400, message:"...issue_types...required..."}}` |
| issue_types 과다(≈25+) | 400 | 동일 형식(요청당 개수 초과) |
| 요청 타입 모두 비활성 | 200 | `{error:{statusCode:404, ...}}` (= empty, §3) |
| 권한/scope 없음 | 403 | 표준 403 |
| 미등록/미편입 | 404 | 표준 404 |

---

## 5. 효율적 수집 전략 (중요 발견)

**무차별 241개 스캔 불필요.** `factors` 응답이 도메인의 활성 issue type을 이미 제공:

```jsonc
GET /companies/{domain}/factors
{ "entries": [
  { "name":"application_security", "score":63, "grade":"D",
    "issue_summary": [
      { "type":"hsts_incorrect_v2", "count":3, "severity":"low",  "total_score_impact":..., "detail_url":"..." },
      { "type":"cookie_missing_http_only", "count":2, "severity":"high", ... }
    ] }
] }
```

→ 권장 흐름:
```
GET /companies/{domain}/factors
  → factors[].issue_summary[].type  == 도메인의 활성 issue type + count
  → 그 type들만 ≤10개 배치로 GET .../active-issues?issue_types=...
  → issue_types[].issues[] 를 finding으로 정규화
```
`total_active_issues` 로 검증 카운트 확보. (241 blind scan 대비 호출 수·429 위험 대폭 감소.)

---

## 6. 포털 Finding 모델로 매핑 가능한 필드 (요약)

| SSC 위치 | 포털 필드 |
|----------|-----------|
| issue_types[].name | issue_type |
| metadata/issue-types[key].title / factor / severity | issue_title / factor / severity |
| factors[].issue_summary[].count | (참고) 타입별 count |
| issues[].issue_id | finding_id (`ssc:{issue_id}`) |
| issues[].domain / url | domain / asset_value(url) |
| issues[].group_status | status |
| issues[].first_seen_time / last_seen_time | first_seen / last_seen |
| issues[].observations[] | evidence_summary (필드/건수 요약) |
| issues[].sources[] | raw_reference_keys.sources (건수) |
| companies/{domain}.uuid | scorecard_identifier |

상세 변환 규칙은 `SSC_RISK_FINDING_NORMALIZATION_PLAN.md` 참고.

---

## 7. Collector Route에서의 처리 (factors-first, 확정)

라우트: `GET /api/integrations/securityscorecard/risk-findings/collect?domain={domain}` (read-only, 화면 미연결).

- **factors-first**: `GET /companies/{domain}/factors` → `issue_summary[].type`로 활성 issue type만 확보(무차별 241 스캔 금지).
- active-issues는 그 type만 **≤10개 배치**로 호출. 배치 하나 실패해도 `warnings[]`에 기록하고 계속.
- **Empty 처리**: 배치 응답이 `{error:{statusCode:404}}`(HTTP 200)면 "해당 배치 활성 없음"으로 **스킵**(오류 아님). 활성 type이 0개면 라우트는 `ok:true, normalizedFindingCount:0`.
- **Batch size ≤10 확정**: 25개는 400. 도메인별 활성 type이 대개 ≤10이라 실제 배치는 1~2회.
- 실측: 활성 type 9~10개, 정규화 finding 22~44건(대부분 info severity). 429 미발생.

## 8. 최종 권장 방식 (확정)

- **factors-first가 최종 권장 수집 방식.** `factors[].issue_summary[].type`로 활성 type만 얻어 active-issues 호출.
- **blind 241 scan 금지** (rate limit·불필요 호출 유발).
- **active-issues batch size ≤10** (25+는 400).
- **empty envelope 처리**: `{error:{statusCode:404}}`(HTTP 200)는 빈 배치로 스킵.
- **metadata 캐시**: `metadata/issue-types`·`metadata/factors`는 TTL 6h 캐시(응답 `metadataCache: {issueTypes,factors}`로 hit/miss 표기). 실측 2회차 호출에서 `hit` 확인.
- **scope guard**: `/all-companies/{domain}` 200이면 in-scope, 403/404면 `SSC_SCOPE_DENIED`로 차단(원문 미노출).
