# SSC Partner Portal — Backend (SecurityScorecard 연동 사전 검증)

SecurityScorecard API를 **서버에서만** read-only로 호출해 연동 가능성을 검증하는 백엔드입니다.
API Token은 백엔드 `.env`에서만 읽으며, 응답/로그/에러 어디에도 노출되지 않습니다.

## 실행 방법

```bash
cd backend
cp .env.example .env          # 그리고 .env에 실제 SSC_API_TOKEN 입력
npm install
npm run dev                   # http://localhost:8787  (또는 npm start)
```

## 환경변수 (backend/.env)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `SSC_API_BASE_URL` | `https://api.securityscorecard.io` | SSC API Base URL |
| `SSC_API_TOKEN` | — | **실제 토큰(서버 전용, git 제외)** |
| `SSC_TEST_DOMAIN` | `example.com` | Probe 대상 테스트 도메인 |
| `SSC_TEST_PORTFOLIO_ID` | — | (선택) 테스트 Portfolio ID |
| `SSC_ENABLE_WRITE_TESTS` | `false` | POST/PUT/PATCH 실제 호출 허용 여부 |
| `SSC_ENABLE_DELETE_TESTS` | `false` | (이번 단계에선 DELETE는 항상 시뮬레이션) |
| `PORT` / `CORS_ORIGIN` | `8787` / `http://localhost:5173` | 서버 설정 |

> 구 변수명 `SECURITYSCORECARD_API_BASE_URL` / `SECURITYSCORECARD_API_TOKEN` 도 하위 호환으로 지원합니다.

## 엔드포인트

### 연동 사전 검증 (신규)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/integrations/securityscorecard/health` | 실행/토큰 설정 여부(값 미노출) |
| GET | `/api/integrations/securityscorecard/probe` | 9개 read-only 체크 요약 결과 |

### 기존 read-only 조회/Import (이전 단계)
| Method | Path |
|--------|------|
| GET | `/api/ssc/health` |
| GET | `/api/ssc/company/:domain/summary` |
| GET | `/api/ssc/company/:domain/factors` |
| GET | `/api/ssc/company/:domain/issues` |
| GET | `/api/ssc/metadata/issue-types` |
| POST | `/api/ssc/import-risk` |

## 안전 원칙 (코드로 강제)

- **GET만 실제 호출.** POST/PUT/PATCH는 기본 `dry-run` (`SSC_ENABLE_WRITE_TESTS=true` + `dryRun:false` 일 때만 실제 호출).
- **DELETE는 절대 실제 실행하지 않음** (`del()`은 항상 시뮬레이션 반환).
- **토큰 마스킹**: `maskSecrets()`로 토큰/Authorization 문자열을 `***REDACTED***` 처리.
- **429 Retry-After 준수**, 5xx 지수 백오프 재시도.
- Probe 응답은 **요약만** 반환(원본 raw 미노출).

## 관련 문서

- `docs/SSC_API_CLIENT_DESIGN.md` — 클라이언트 설계
- `docs/SSC_API_PROBE_RESULT_SAMPLE.md` — Probe 응답 샘플
- `docs/SSC_API_CLASSIFICATION.md` — API 분류 (MVP/Phase2/3/Collector/Dry-run)
- `docs/SSC_PORTAL_API_MAPPING.md` — 화면별 API 매핑
- `docs/SSC_MOCK_TO_REAL_API_MIGRATION_PLAN.md` — Mock→Real 전환 계획
