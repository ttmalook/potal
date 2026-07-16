# SSC API Client 설계 (Client Design)

대상: `backend/` (Node.js + Express). 구현 파일은 이미 존재하며 본 문서는 설계 근거/계약을 정리한다.

관련 코드:
- `backend/src/securityScorecardClient.js` — 강화 클라이언트(retry/pagination/dry-run/mask)
- `backend/src/probe.js` — 연동 사전 검증 Probe
- `backend/src/ssc.js`, `normalize.js` — 기존 read-only 호출 + 정규화
- `backend/src/server.js` — 라우트

---

## 1. 요구사항 → 구현 매핑

| 요구사항 | 구현 |
|----------|------|
| Base URL 환경변수화 | `SSC_API_BASE_URL` (구 `SECURITYSCORECARD_API_BASE_URL` 하위호환) |
| Token 환경변수화 | `SSC_API_TOKEN` (구 `SECURITYSCORECARD_API_TOKEN`) — **서버에서만 read** |
| Authorization 자동 주입 | `rawRequest()`가 `Authorization: Token <token>` 헤더 부착 |
| Token 로그 마스킹 | `maskSecrets()` — 토큰/`Token xxx`/Authorization → `***REDACTED***` |
| 공통 error handler | `classifyStatus()` — 400/401/403/404/429/5xx → 표준 errorCode+message |
| 429 Retry-After | `rawRequest()` 재시도 루프가 `Retry-After` 준수(캡 5s), 5xx 지수 백오프 |
| Pagination | `collect()` — `entries[]` 또는 `Link: rel="next"` 기반, `maxPages` 가드 |
| Dry-run mode | `write()` — 기본 dry-run, `SSC_ENABLE_WRITE_TESTS=true` & `dryRun:false`만 실제 호출 |
| Write/Delete 보호 | `del()`는 항상 시뮬레이션(절대 실행 안 함), write는 gate 통과 필요 |

---

## 2. 인증 / 공통 헤더

```
Authorization: Token <SSC_API_TOKEN>
Accept: application/json; charset=utf-8
Content-Type: application/json
```
토큰은 `securityScorecardClient.js` 내부에서만 참조. 응답/에러/로그로 반환 금지.

---

## 3. 공개 API (계약)

```js
// GET — 실제 호출 (read-only)
get(path, query?) -> { ok, status, data, linkHeader } | { ok:false, status, error:{errorCode,message} }

// POST/PUT/PATCH — 기본 dry-run
write(method, path, { body, dryRun=true })
  -> dry-run: { ok:true, dryRun:true, method, path, wouldSend, note }
  -> 실행조건(SSC_ENABLE_WRITE_TESTS=true & dryRun:false): 실제 호출 결과

// DELETE — 항상 시뮬레이션 (이번 단계 절대 실행 금지)
del(path) -> { ok:true, simulated:true, method:'DELETE', path, note }

// Pagination 수집
collect(path, { query, itemsKey, maxPages=5, pageParam='page' })
  -> { ok:true, items:[...], pages } | { ok:false, error, collected }

// 유틸
config           // { baseUrl, testDomain, testPortfolioId, enableWriteTests, enableDeleteTests }
tokenConfigured()// boolean (placeholder/빈값 제외)
maskSecrets(x)   // 토큰/Authorization 마스킹된 문자열
classifyStatus(s)// { errorCode, message }
```

---

## 4. 에러 코드 표준

| HTTP | errorCode | 의미 |
|------|-----------|------|
| 400 | `SSC_BAD_REQUEST` | 잘못된 요청/도메인 형식 |
| 401 | `SSC_UNAUTHORIZED` | 토큰 무효/누락/폐기 |
| 403 | `SSC_FORBIDDEN` | 권한/Feature/Portfolio 접근 불가 |
| 404 | `SSC_NOT_FOUND` | 미등록 또는 보호 목적 Not Found |
| 429 | `SSC_RATE_LIMITED` | Rate Limit (Retry-After 준수) |
| 5xx | `SSC_UPSTREAM_ERROR` | 서버 오류(재시도) |
| — | `SSC_NETWORK_ERROR` | 연결 실패 |
| — | `SSC_TOKEN_MISSING` | 토큰 미설정 |

프론트는 `errorCode`로 분기해 사용자 메시지를 표시(Probe/Import 패널).

---

## 5. Dry-run / 안전 가드 규칙 (요약)

1. **GET만 기본 실행.**
2. **POST/PUT/PATCH** = 기본 dry-run. 실제 실행하려면:
   - `SSC_ENABLE_WRITE_TESTS=true` **그리고** 호출부에서 `dryRun:false` 명시.
3. **DELETE** = 이번 단계 **항상 시뮬레이션**. `SSC_ENABLE_DELETE_TESTS`가 true여도 실제 호출 안 함.
4. Bulk update/delete는 write()/del() 경유로만 접근 → 무제한 실행 불가.

---

## 6. Pagination 설계

- 응답이 배열이면 그대로, `entries[]`면 entries 사용.
- `Link` 헤더에 `rel="next"`가 있으면 그 URL로 이어감(고정 URL 조립 지양).
- `maxPages`(기본 5)로 폭주 방지. Report/대량 수집은 별도 상한 지정.

---

## 7. 라우트 (server.js)

```
GET /api/integrations/securityscorecard/health   → probe.health()   (토큰 값 미노출)
GET /api/integrations/securityscorecard/probe    → probe.runProbe() (9개 read-only 요약)
```
기존 `/api/ssc/*` (summary/factors/issues/metadata/import-risk)도 동일 클라이언트 원칙을 따른다.

---

## 8. 향후 확장 시 추가 메서드(스켈레톤 제안)

```js
// 공통 Issue Collector (Issue Type Details 75 + Historical 35 대체)
getIssueDetails(scorecardId, issueType)        // GET /companies/{id}/issues/{issue_type}
getHistoricalIssue(id, effectiveDate, type)    // GET /companies/{id}/history/events/{date}/issues/{type}

// 리포트 비동기 흐름
createReport(kind, body, {dryRun})             // write('POST', '/reports/'+kind, ...)
pollRecentReports()                            // get('/reports/recent')
downloadReportFile(filePath)                   // get('/reports/files/'+filePath)
```
