# Dev Mocks 정책 — 사용자 화면 Mock 제거 · 환경변수 기반 Dev-only 전환

작성: 2026-07-02 · 관련 코드: `src/config/runtime.js`, `.env.example`, `src/features/SscApi.jsx`, `src/pages/Pages.jsx`

## 1. 배경 (Mock Mode 제거)

Mock Mode는 SSC API 연동 전 UI 흐름 검증용 개발 기능이었다. 현재 Risk Findings는 Real SSC API(read-only)로,
Validation Sandbox는 Partner Lab PoC + Template Guidance 구조로 정리되어, 사용자-facing 화면에 Mock이 섞이면
"이 데이터가 실제 SSC 결과인지 / PoC인지 / Mock인지 / 고객 검증 결과인지" 혼동을 준다.

→ **사용자 화면에서 Mock을 제거**하고, **Mock 데이터는 dev-only fixture로 보존**한다.

## 2. Mock 데이터를 삭제하지 않는 이유

운영용으로 보여주기 위함이 아니라, 개발 안정성·테스트·교육 목적의 기준 데이터로 가치가 있기 때문:
1. **API 미연결/offline 개발** — 토큰/포트폴리오 권한/scope/rate limit에 막히지 않고 화면 개발 지속.
2. **UI 회귀 테스트 fixture** — 테이블/배지/탭/스코프 행 렌더 정상 여부 확인용 고정 샘플.
3. **특정 상태값 테스트** — critical/0건/scope denied/rate limit/특정 issue_type/pending 등 실데이터에 없을 수 있는 케이스.
4. **교육/데모** — 실제 고객명·도메인·score 노출 없이 제품 흐름 시연/온보딩.
5. **향후 자동 테스트** — 실 API 의존을 줄인 안정적 fixture.

## 3. 환경변수 (`ENABLE_DEV_MOCKS`)

```env
VITE_ENABLE_DEV_MOCKS=false   # 기본값
```
```js
// src/config/runtime.js
export const ENABLE_DEV_MOCKS = import.meta.env.VITE_ENABLE_DEV_MOCKS === 'true'
```

| 값 | 동작 |
|----|------|
| `false` (기본/미설정) | Mock Mode 토글·Mock Sample·Mock fallback 미노출. API/Backend 실패 시 오류 상태만 표시. 사용자 화면엔 Real SSC API / Partner Lab PoC / Template Guidance만. |
| `true` | Developer Mock Samples 및 수동 "Mock 데이터로 보기" 버튼 표시(명확한 라벨). 자동 fallback 아님. |

## 4. API 오류 시 Mock fallback 금지

- 이전: `BACKEND_UNREACHABLE` → 자동으로 Mock 테이블 표시.
- 변경: `BACKEND_UNREACHABLE` → **`unreachable` 오류 상태**(백엔드 실행/토큰/scope/재시도 안내). Mock 자동 대체 없음.
- `ENABLE_DEV_MOCKS=true`일 때만 오류 화면에 **수동** "Developer: Mock 데이터로 보기" 버튼 제공.
- 상태 구분: `loading / success / empty / scope / rate / error / unreachable(Backend Unavailable) / mock(dev-only)`.

## 5. Mock 데이터 보존 위치

- `src/data/mock.js` — dev-only fixture로 유지(상단 주석 명시). 삭제 금지.
- 사용처는 `ENABLE_DEV_MOCKS` 가드 뒤에서만 import/렌더.

## 6. 화면별 데이터 출처

| 화면 | 기본(false) 출처 | 비고 |
|------|------------------|------|
| Dashboard | in-memory 등록 수 + 프로토타입 예시 지표(출처 고지) | Risk/재스캔 지표는 Real API 연동 후 |
| Customers | app state(등록) | in-memory prototype |
| Domains & Scope | app state(등록) | serviceEndpoint/sscLookupDomain 분리 |
| Risk Findings | Real SSC API (read-only) | 실패 시 오류 상태, Mock 자동표시 없음 |
| Validation Sandbox | Partner Lab PoC 실행 결과 | Mock 실행 예시는 dev-only |
| Evidence Packs | 생성된 Partner Lab PoC/Evidence | Mock Pack은 dev 판단 |

## 7. 배지/문구 정책

- 유지: Real SSC API · Read-only · Partner Lab PoC · Template Guidance · Not Customer Validation · In-memory Prototype.
- 제거/dev-only: Mock Mode · Mock Sample · Mock Data · Sample History(실제 이력처럼 보이는 표현).
- 대체 표현: "아직 데이터 없음" · "Real SSC API 연결 필요" · "Partner Lab PoC 실행 이력 없음" · "연동 예정" · "개발자 샘플".

## 8. 이번 작업 범위 밖(금지)

Mock 파일 삭제, Real API 구조 변경, SSC write/Report POST/Validation POST/Portfolio PUT/Followed PATCH/DELETE,
DB 연결 변경, Finding/Customer Detail Real 연결, Evidence 자동 생성 고도화 — **미실행**. UI 모드 정리만.
