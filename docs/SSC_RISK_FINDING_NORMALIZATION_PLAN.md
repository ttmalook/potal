# SSC Active Issue → Portal Risk Finding 정규화 계획

목적: SSC `active-issues` finding을 우리 포털 `risk_finding` 모델로 변환하는 규칙 정의.
구현 프로토타입: `backend/src/securityScorecardIssueCollector.js` (`normalizeActiveIssue`, `collectRiskFindingsForDomain`).

---

## 1. 표준 정규화 필드 → 매핑 규칙

| 포털 필드 | 소스 | 규칙 |
|-----------|------|------|
| `finding_id` | issues[].issue_id | `ssc:{issue_id}` (없으면 `ssc:{domain}:{type}:{url}`) |
| `source` | 고정 | `"SecurityScorecard API"` |
| `scorecard_identifier` | companies/{domain}.uuid | summary 1회 조회 |
| `domain` | issues[].domain ‖ 요청 domain | finding 우선 |
| `issue_type` | issue_types[].name | = metadata key |
| `issue_title` | metadata/issue-types[key].title | 없으면 key |
| `factor` | metadata[key].factor ‖ factors[].name | metadata 우선 |
| `severity` | metadata[key].severity ‖ issue_summary[].severity | low/medium/high/info/critical |
| `status` | issues[].group_status | 기본 `active` |
| `first_seen` | issues[].first_seen_time | ISO |
| `last_seen` | issues[].last_seen_time | ISO |
| `asset_type` | 파생 | url→`url`, ip→`ip`, domain→`domain` |
| `asset_value` | issues[].url ‖ domain ‖ ip | 표시용 대표 자산 |
| `ip` | issues[].ip ‖ observations[].ip | 네트워크 계열만 존재 |
| `port` | issues[].port ‖ observations[].port | 네트워크 계열만 존재 |
| `protocol` | issues[].protocol ‖ observations[].protocol | 있을 때만 |
| `evidence_summary` | issues[].observations[] | **원본 값 저장 금지** → `"N observation(s); fields: a,b,c"` |
| `recommendation_summary` | metadata/issue-types/{type} 또는 issue-context/{type} | 선택 보강(추가 GET) |
| `raw_reference_keys` | issue_id/sources/observations | 역참조 키/건수만(원본 미저장) |
| `collected_at` | 수집 시각 | 서버 생성 ISO |

**severity 정규화**: `critical/high/medium/low/info` → 포털 배지(SeverityBadge)는 High/Medium/Low 중심 → `info`는 Low 또는 별도 Info 배지로 매핑.

---

## 2. metadata/issue-types 와 active-issues 결합 방식

```
1) getIssueTypeCatalog()            → key → {factor, severity, title}  (241, 1회 캐시)
2) getActiveIssueTypesForDomain()   → factors[].issue_summary[]  = 활성 type+count
3) getActiveIssuesByBatch()         → 활성 type만 ≤10 배치로 active-issues 호출
4) normalizeActiveIssue()           → issues[]를 risk_finding으로 변환 + catalog로 factor/severity/title 보강
```
- 개별 issue_type 전용 함수 없음. 전부 파라미터화된 공통 수집기.
- batch 실패는 `warnings[]`로 남기고 **전체 수집 중단하지 않음**.
- empty 엔벨로프(`{error:{statusCode:404}}`)는 "해당 배치 활성 없음"으로 스킵(정상).

---

## 3. 화면 표시 필드 (Risk Findings / Finding Detail)

- 목록: `issue_title`, `factor`, `severity`, `asset_value`, `last_seen`, `status`, `source`(=SecurityScorecard API)
- 상세: 위 + `first_seen`, `asset_type/ip/port/protocol`, `evidence_summary`, workflowState(포털)
- workflowState 초기값: `SSC Risk Imported` (기존 포털 상태머신과 연결)

## 4. DB 저장 후보 필드 (향후 PostgreSQL)

```
risk_findings(
  finding_id PK, source, scorecard_identifier, domain,
  issue_type, issue_title, factor, severity, status,
  first_seen, last_seen, asset_type, asset_value, ip, port, protocol,
  evidence_summary,           -- 요약 텍스트(원본 관측값 미저장)
  recommendation_summary,
  workflow_state,             -- 포털 워크플로우
  collected_at, updated_at
)
issue_type_catalog(key PK, factor, severity, title, synced_at)
```
- **observations 원본(raw_cookie 등 민감 가능)은 DB에 원본 저장하지 않음** — 요약/필드명만.
- 재수집 시 `finding_id`(=issue_id) 기준 upsert, 사라진 finding은 `status=resolved_candidate`로 표시(단, 실제 해소는 SSC 재스캔 확인).

## 5. Evidence Pack에 넘길 필드

- SSC Finding Data 섹션: `issue_type, issue_title, factor, severity, first_seen, last_seen, scorecard_identifier`
- 관측/증적: `asset_value(url/domain)`, `evidence_summary`(요약), `status`
- **파트너 랩 PoC 증적은 별도**(SSC 데이터 아님) — 기존 원칙 유지.

## 6. 고객 전달 시 마스킹 / 주의사항

- 고객 화면에는 `raw_cookie` 등 **원본 관측값 미노출** → `evidence_summary` 요약만.
- 내부 식별자(`issue_id`, `scorecard uuid`)는 고객 화면 비노출(내부/Audit용).
- 표현 원칙 유지: “조치 완료/검증 완료” 금지, “SSC 재스캔/공식 Validation 필요”로 표기.
- 타 고객 도메인/자산이 섞이지 않도록 `domain` 스코프 필터 필수.

## 7. Collector Route 응답 예시 (실측, 마스킹)

`GET /api/integrations/securityscorecard/risk-findings/collect?domain={domain}` (read-only, 화면 미연결)

```jsonc
{
  "ok": true,
  "domain": "***.com",                 // 마스킹
  "source": "securityscorecard",
  "collectionMode": "factors-first",
  "activeIssueTypeCount": 9,
  "reportedActiveIssues": 44,
  "normalizedFindingCount": 44,
  "returnedFindingCount": 20,           // 최대 20건만 반환
  "truncated": true,
  "findings": [
    {
      "finding_id": "ssc:masked",       // 내부 issue_id 미노출
      "issue_type": "cookie_missing_http_only",
      "issue_title": "Session Cookie Missing 'HttpOnly' Attribute",
      "factor": "application_security",
      "severity": "high",
      "status": "active",
      "asset_type": "url",
      "asset_value": "https://***.kr/…", // 호스트 마스킹
      "first_seen": "2026-05-13",        // date-only
      "last_seen": "2026-06-29",
      "evidence_summary": "observations: 3, sources: 1", // 원본 관측값 미노출
      "recommendation_summary": "- Include the HTTP-only attribute when setting the session cookie. …" // metadata 권고 요약(≤180자)
    }
  ],
  "warnings": [],
  "errors": []
}
```

Scope-out(예: 미편입 도메인):
```jsonc
{ "ok": false, "domain": "***.com", "normalizedFindingCount": 0,
  "findings": [], "warnings": [], "errors": [{ "errorCode": "SSC_FORBIDDEN", "message": "…권한/Portfolio…" }] }
```

## 8. 마스킹 정책 (route 응답 경계에서 강제)

| 필드 | 정책 |
|------|------|
| `finding_id` | 항상 `"ssc:masked"` (내부 issue_id/uuid 미노출) |
| `domain` | `***.{tld}` |
| `asset_value` (url) | `https://***.{tld}/…` (호스트 마스킹) |
| `asset_value` (domain) | `***.{tld}` |
| `asset_value` (ip) | `masked-ip` |
| `first_seen` / `last_seen` | date-only(`YYYY-MM-DD`) |
| `evidence_summary` | `"observations: N, sources: M"` (raw_cookie/observation 원본 미노출) |
| `recommendation_summary` | `metadata/issue-types/{type}` 권고 텍스트 요약(≤180자, 일반 가이드) |
| `scorecard_identifier` | **응답 미포함**(내부 전용) |
| findings 개수 | **최대 20건** (`normalizedFindingCount`로 총계만 표기) |

## 8b. 최종 Collector Response Schema (risk-findings.v1, 확정)

```jsonc
GET /api/integrations/securityscorecard/risk-findings/collect
    ?domain={d}&limit=20&offset=0&severity=high,medium&factor=application_security&includeInfo=false
{
  "ok": true,
  "schemaVersion": "risk-findings.v1",
  "source": "securityscorecard",
  "collectionMode": "factors-first",
  "domain": "***.com",
  "metadataCache": { "issueTypes": "hit", "factors": "hit" },
  "summary": {
    "score": 97, "grade": "A",
    "activeIssueTypeCount": 9, "reportedActiveIssues": 44,
    "totalNormalizedFindingCount": 44,     // 필터 적용 후 총계(페이지네이션 기준)
    "returnedCount": 20, "limit": 20, "offset": 0,
    "hasMore": true, "nextOffset": 20
  },
  "filters": { "severity": ["critical","high","medium","low","info"], "factor": null, "includeInfo": true },
  "findings": [ /* maskFinding() 적용, 최대 limit(≤100) */ ],
  "warnings": [], "errors": []
}
```

### Pagination / limit 정책
- 기본 `limit=20`, 최대 `100`. `offset` 기반. `totalNormalizedFindingCount`(필터 후)·`returnedCount`·`hasMore`·`nextOffset` 제공.
- UI: 최초 20건 → "더 보기"로 `nextOffset` 재요청(append). 무한 스크롤 미사용.

### Severity / factor filter 정책
- `severity`=critical,high,medium,low,info(부분집합). `factor`=factor key CSV. `includeInfo`(기본 true, UI 기본 노출은 false로 info 숨김).
- API는 info를 제거하지 않고 옵션으로 노출(정책은 UI에서 결정).

### Sorting 정책
1) severity(critical>high>medium>low>info) → 2) factor → 3) last_seen desc → 4) issue_type.

### info-level 표시 정책
- info 다량(등급 A도 다수) → UI 기본 숨김 + "정보성(info) 이슈 포함" 토글. 정렬은 severity 우선.

### Scope guard 정책
- 수집 전 `/all-companies/{domain}` 200 확인. 아니면 `SSC_SCOPE_DENIED`(고객명/도메인 원문 미노출).

## 9. Risk Findings 화면 연결 전제 조건 (아직 연결 금지)
- [x] active-issues 응답 스키마 확정
- [x] factors-first 수집(무차별 스캔 금지)
- [x] 마스킹/20건 제한/에러·scope·warnings 처리
- [x] recommendation 보강(`metadata/issue-types/{type}`)
- [x] severity `info` 다량 → 필터/우선순위 정책 (includeInfo 토글 + severity 정렬)
- [x] 대량 findings 서버측 페이지네이션 (limit/offset/hasMore/nextOffset)
- [x] issue-types/factors catalog 캐싱 (TTL 6h, metadataCache hit/miss)
- [x] domain scope guard (`/all-companies/{domain}`, SSC_SCOPE_DENIED)
- [x] Risk Findings 목록 화면 Mock/Real 토글 연결 (기본 Mock)
- [ ] (이후) Finding Detail 상세 연결, Customer Detail/Factor 전환, 캐시 무효화/재수집 스케줄, 고객별 다중 도메인 집계
