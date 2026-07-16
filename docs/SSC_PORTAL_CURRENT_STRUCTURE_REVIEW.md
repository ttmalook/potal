# SSC Partner Portal — 현재 구조 분석 (Current Structure Review)

작성 목적: SecurityScorecard API 연동 전, 현재 React 포털 + Backend 구조를 파악하고 Real API adapter를 어디에 어떻게 붙일지 판단한다.

---

## 1. 기술 스택 요약

| 영역 | 스택 | 비고 |
|------|------|------|
| Frontend | React 18 + Vite 5 (순수 CSS) | SPA 프로토타입 |
| 라우팅 | `useState` 기반 화면 전환 (react-router 미사용) | `App.jsx`의 `view` state |
| 상태관리 | React `useState` (App.jsx에서 lifting) | 전역 store(zustand/redux) 없음 |
| Backend | Node.js + Express (`backend/`) | SSC read-only 프록시 |
| SSC 호출 | 백엔드에서만 (`Authorization: Token`) | 토큰 서버 전용 |

---

## 2. 디렉터리 구조 (핵심)

```
claude/
├─ index.html
├─ vite.config.js              # /api → backend proxy(8787)
├─ .env.example                # VITE_SSC_API_MODE=mock|backend
├─ src/
│  ├─ main.jsx / App.jsx       # 셸 + 화면 전환 + lifted state
│  ├─ App.css / index.css      # 디자인 토큰 + 컴포넌트 스타일
│  ├─ data/mock.js             # ★ 모든 Mock 데이터 단일 소스
│  ├─ components/common.jsx    # 재사용 컴포넌트(Badge/Table/Timeline 등)
│  ├─ features/
│  │  ├─ Registration.jsx      # 고객/도메인 등록 Wizard·Modal
│  │  └─ SscApi.jsx            # backend import + SSC Smoke Test 패널
│  ├─ lib/sscApi.js            # ★ Frontend→Backend API 클라이언트 (유일한 fetch 계층)
│  └─ pages/Pages.jsx          # 11개 화면 컴포넌트
└─ backend/
   ├─ src/server.js            # Express 라우트
   ├─ src/securityScorecardClient.js  # ★ 강화 SSC 클라이언트(retry/dry-run/mask)
   ├─ src/probe.js             # ★ 연동 사전 검증 Probe
   ├─ src/ssc.js / normalize.js       # 기존 read-only 클라이언트 + 정규화
   └─ .env(.example)           # 토큰(서버 전용)
```

`★` = API 연동 시 손대야 하는 핵심 파일.

---

## 3. 라우팅 / 화면 구조

- `App.jsx`의 `view`(문자열) + `param`(상세 id)으로 SPA 전환. URL 라우팅 없음(딥링크 불가).
- 사이드바 10개 메뉴: Dashboard, Customers, Domains & Scope, Risk Findings, (Finding Detail), Remediation Guides, Validation Sandbox, Evidence Packs, Customer View, Audit Log. (파트너 검수 메뉴는 폐지 — 검수 단계 없이 고객 전달 화면 미리보기가 최종 확인)
- 화면은 모두 `pages/Pages.jsx`의 named export. `app` prop(핸들러 묶음)을 통해 상태/네비게이션 전달.

### `app` 핸들러 묶음 (App.jsx)
```
{ navigate, customers, domains, findings, newCustomerId, newDomainId,
  showToast, addFindings, sscMode, isBackendMode,
  openCustomerWizard, openDomainModal }
```
→ **Real API 연동 시 여기에 로딩/에러 상태와 데이터 소스 훅을 추가**하면 화면 수정 최소화.

---

## 4. Mock 데이터 위치 (전환 대상 인벤토리)

`src/data/mock.js` 단일 파일에 집중되어 있어 전환이 용이하다.

| export | 화면 | Real API 대체 후보 |
|--------|------|--------------------|
| `customers` | Customers | `GET /portfolios/{id}/companies`, `GET /all-companies` |
| `domains` | Domains & Scope | Portfolio companies + Footprint(Phase2) |
| `findings` / `findingDetails` | Risk Findings/Detail | `active-issues` + `metadata/issue-types` + `issues/{type}` |
| `dashboardStats` / `workQueues` | Dashboard | 집계(포털 내부 계산) + score/factor |
| `guides` / `guideDetail` | Remediation Guides | `metadata/issue-types/{type}`(recommendation) |
| `sandboxRuns` 등 | Validation Sandbox | **연동 대상 아님(파트너 랩 PoC)** |
| `evidencePacks` / `evidenceSscFinding` | Evidence Packs | `reports/*` + score/factor/issues |
| `customerView` | Customer View | 위 파생(고객 안전 필드만) |
| `auditLog` | Audit Log | 포털 내부 이벤트 |
| `sscPreview` | Wizard/Import | `companies/{id}` + `factors` + `active-issues` |

---

## 5. 현재 API 호출 계층 (이미 존재)

- **Frontend는 SSC를 직접 호출하지 않는다.** 유일한 fetch 계층은 `src/lib/sscApi.js` → 우리 백엔드(`/api/...`)만 호출.
- 모드 스위치: `VITE_SSC_API_MODE=mock|backend` (`import.meta.env`). 기본 `mock`.
- Backend에 이미 read-only 엔드포인트 6종 + 이번에 추가된 **Probe 2종**이 존재.

→ **API Proxy 계층이 이미 구축되어 있음.** 신규 백엔드를 만들 필요가 없으며, 기존 Express에 라우트/서비스만 확장하면 된다.

---

## 6. 결론 — 연동 접근 방식

1. **백엔드는 그대로 Express 확장** (Python 전환 불필요). 토큰 보호/프록시 구조가 이미 정착.
2. **Frontend는 `lib/sscApi.js`만 확장**하고 화면은 `app` 훅으로 데이터 주입 → 화면 코드 변경 최소화.
3. **전환은 Mock 유지 + adapter 추가 방식**(빅뱅 금지). 화면별로 `mock|backend` 소스를 선택.
4. 우선순위: Integration Health/Probe → Customers → Customer summary/factors → Active Issues → Finding 상세 → Reports.

상세 분류/매핑/전환계획은 `SSC_API_CLASSIFICATION.md`, `SSC_PORTAL_API_MAPPING.md`, `SSC_MOCK_TO_REAL_API_MIGRATION_PLAN.md` 참고.
