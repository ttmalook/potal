# SSC Domain / Endpoint Scope Model

작성: 2026-07-02 · 관련 코드: `src/lib/domainScope.js`, `src/features/Registration.jsx`, `src/pages/Pages.jsx`, `backend/src/lab.js`

## 1. 문제 정의

기존 `cleanDomain()`은 `https://gateway.example.com:8443` 입력 시 스킴/경로와 함께 **포트(`:8443`)까지 제거**했다.
그 결과 SSC 조회는 정상(host 기준)이었으나, Sandbox/Lab 접속·검증 대상이 `gateway.example.com`(443)으로 바뀌어
실제 서비스가 뜬 `:8443`을 검증하지 못하는 문제가 있었다.

→ **SSC 조회용 값**과 **실제 접속/검증 대상**을 분리한다.

## 2. 필드 모델 (`parseEndpoint(raw)`)

| 필드 | 의미 | 예 (`https://gateway.example.com:8443/login`) |
|------|------|------|
| `rawDomainInput` | 사용자가 입력한 원본 | `https://gateway.example.com:8443/login` |
| `host` | 호스트만 (소문자, trailing dot 제거) | `gateway.example.com` |
| `port` | 포트 (Number, 없으면 null) | `8443` |
| `serviceEndpoint` | **host[:port]** — 접속 대상 식별자, 포트 보존 | `gateway.example.com:8443` |
| `accessUrl` | **scheme://host:port** — 접속 검증 URL, 사용자 수정 가능 | `https://gateway.example.com:8443` |
| `sscLookupDomain` | **host만** — SSC API 조회 기준 | `gateway.example.com` |

- 스킴이 없으면 포트로 추정: `:80` → http, 그 외 → https (사용자가 화면에서 수정 가능).
- userinfo(`user@`), 경로/쿼리/프래그먼트는 제거하되 **포트는 절대 제거하지 않는다.**
- IPv6 대괄호(`[::1]:8443`) 지원.

## 3. 용도별 사용 값

| 용도 | 사용 필드 | 이유 |
|------|-----------|------|
| SSC API 조회 (`/companies/{domain}`, active-issues) | `sscLookupDomain` (host) | SSC는 스코어카드를 host 기준으로 관리, 포트 개념 없음 |
| Sandbox / Lab PoC 접속·재현 | `accessUrl` / `serviceEndpoint` | 실제 서비스가 뜬 포트에 접속해야 함 |
| 검증 명령 치환 (`{host}`,`{port}`,`{endpoint}`) | host / port / serviceEndpoint | curl/dig/openssl/nmap 실행 대상 |

## 4. 중복 정책 (`endpointConflicts`)

- 중복 판단 기준: **`customerId + serviceEndpoint`** (host:port).
- 같은 host, **다른 port** → **다른 Endpoint로 허용** (예: `:8443` 서비스와 `:9443` 관리콘솔).
- 같은 `serviceEndpoint` 재등록 → `exactDup` = 등록 차단(danger).
- 같은 `sscLookupDomain`(host)에 다른 `serviceEndpoint` 존재 → `sameLookupDifferentEndpoint` = 경고만 표시:
  > "동일한 SSC 조회 기준 도메인을 사용하는 다른 서비스 Endpoint가 있습니다."

## 5. 화면 반영

- **Domain 등록 Modal**: 대상 Endpoint 입력 + 접속 검증 URL(수정 가능) + 실시간 미리보기(서비스 Endpoint / SSC 조회 기준 / 접속 검증 URL / 포트 보존) + 중복/동일 lookup 경고.
- **Domains & Scope 테이블**: `서비스 Endpoint` / `SSC 조회 기준` / `접속 검증 URL` 3개 컬럼으로 분리 표기. 포트가 있으면 `:8443` 배지.
- **Validation Sandbox 패널**: Endpoint 입력 → 미리보기 → 실행 시 `serviceEndpoint/accessUrl/sscLookupDomain`을 백엔드에 전달.

## 6. 저장 스키마 (domain row)

```js
{
  id, customer,
  primary: serviceEndpoint,     // 대표 표기(하위호환) = host:port
  rawDomainInput, host, port,
  serviceEndpoint, accessUrl, sscLookupDomain,
  baseUrl: accessUrl,           // 하위호환 별칭
  allow, deny, screenshot, har, consent, status
}
```

기존 mock 도메인(포트 없음)은 `serviceEndpoint`/`sscLookupDomain` 미보유 시 `primary`에서 파생(fallback)하여 렌더한다.
