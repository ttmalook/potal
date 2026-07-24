# Validation Sandbox (Partner Lab PoC) — Docker 스캐폴드

파트너 표준 검증랩에서 issue_type을 재현하고 **Before/After 참고 증적**을 생성한다.
현재 오케스트레이터는 `simulated` 수집기로 동작하며(브라우저에서 바로 확인 가능), 아래 Docker 스택으로 **실제 Playwright 수집**으로 교체할 수 있다.

> 주의: 이 랩은 **참고용 PoC**다. 고객 운영환경 검증/조치 완료가 아니며, 실제 해소는 **SecurityScorecard 재스캔**으로 확인한다.
> 랩은 격리 환경에서만 실행하고 **고객 도메인에 접근하지 않는다.**

## 구성
- `docker-compose.yml` — postgres + http 취약/조치 타깃(nginx) + evidence-collector(Playwright)
- `targets/http-vulnerable`, `targets/http-remediated` — HTTP 헤더 카테고리 재현 타깃
- `evidence-collector/` — Playwright 수집기(스크린샷 + 응답 헤더 diff)
- `../db/schema.sql` — Postgres 스키마(portal + lab)

## 실행
```bash
cd lab
docker compose up --build
#  - postgres:            localhost:5432 (ssc_portal / ssc)
#  - evidence-collector:  localhost:8899
```

## 백엔드 연동 (simulated → docker 교체)
`backend/.env` 에 추가:
```env
LAB_COLLECTOR=docker
LAB_COLLECTOR_URL=http://localhost:8899
```
그리고 백엔드 재시작. 이제 포털 Validation Sandbox의 "표준 검증랩 PoC 실행"이 **실제 Playwright**로 vulnerable/remediated 타깃을 캡처해 헤더 diff를 만든다.
(LAB_COLLECTOR 미설정/`simulated`면 Docker 없이도 동작 — 기본값.)

## 현재 스캐폴드 범위 / 다음 단계
- ✓ HTTP 헤더 카테고리(HSTS/CSP/Cookie/X-Powered-By/Server): 실제 Playwright 수집 가능.
- - TLS/DNS/네트워크 카테고리: 스캐너(openssl/dig/nmap) 타깃 + 리포트 렌더 추가(Phase D).
- - 포털 DB를 파일 저장소 → Postgres로 승격(스키마는 `db/schema.sql` 준비됨).
- - per-run 컨테이너 일시 기동(현재는 always-on 타깃) — dockerode/compose 동적 제어(Phase D).
- - Evidence Pack에 실제 아티팩트(png/har) 첨부 + 서명/해시.

설계 전체: `docs/SSC_VALIDATION_SANDBOX_DESIGN.md`
