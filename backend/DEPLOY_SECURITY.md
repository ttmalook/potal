# 배포 보안 체크리스트

영향도 평가(암호화·영속·인증) 결과에 따른 배포 전 필수/권장 사항.

## 🔴 1순위 — 시크릿 (배포 게이트 · 코드 아님)

`NODE_ENV=production` 이면 아래가 기본값/미설정일 때 **서버가 부팅을 거부**합니다(`assertAuthConfig`).

| env | 이유 |
|---|---|
| `AUTH_ACCESS_SECRET` | JWT 서명 키. 기본값이면 **토큰 위조 → 전체 인증 우회** |
| `SEED_ADMIN_PASSWORD` | 기본값이면 기본 관리자 탈취 |
| `PGPASSWORD` / `DATABASE_URL` | 실제 DB 자격증명 |

```bash
# 강한 시크릿 생성
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 2순위 — 전송 중 암호화 (in-transit)

- **DB 연결 TLS**: `PGSSL=true` (사설 CA면 `PGSSL_REJECT_UNAUTHORIZED=false`). 또는 `DATABASE_URL=...?sslmode=require`.
- **웹 HTTPS**: 리버스프록시(nginx)에서 TLS 종단. HSTS 는 **nginx 가 단일 소스로 소유**(중복 방지). 앱은 기본 미전송이며, nginx 없이 앱이 직접 TLS 종단하는 예외 배포에서만 `APP_SEND_HSTS=true`.
- **쿠키**: 프로덕션에서 refresh 쿠키에 `Secure` 자동 부여(`NODE_ENV=production`).

## 3순위 — 저장 시 암호화 (at-rest) · 인프라

Postgres 코어에는 투명 암호화(TDE)가 없음. 실용 순서:

1. **볼륨/디스크 암호화** (권장·앱 코드 0):
   - 클라우드: 암호화 볼륨(EBS/PD 암호화) + KMS
   - 온프레미스: LUKS 등 FDE
   - Docker: 암호화된 호스트 볼륨에 pgdata 마운트
2. **백업 암호화**: `pg_dump` 산출물도 암호화 저장.
3. 컬럼 단위(pgcrypto)는 "특정 필드만 반드시 암호화" 요구가 있을 때만(키 관리 부담).

> 증적 팩(고객 자산 URL·증거)은 민감 데이터 → 볼륨 암호화로 커버.

## 리버스프록시 (nginx) 개요

```nginx
# /           → 정적 SPA(dist) 서빙 (인증 없음: #share 게시 링크 로드 위해)
# /api/public → 백엔드로 프록시 (무인증 공개)
# /api/*      → 백엔드로 프록시 (앱단 JWT 인증)
# CSP·HSTS 등 보안 헤더는 여기(nginx)에서 단일 소스로 부여
```

이 설계는 **`claude/docker-compose.yml` 스택으로 구현**되어 있습니다: `web`(nginx, 80/443·TLS 종단·SPA·`/api` 프록시) → `backend`(8787, 내부) → `db`(postgres, 내부). 구성 파일: `docker/Dockerfile.web`, `docker/Dockerfile.backend`, `docker/nginx/default.conf`, `docker/nginx/40-ssc-tls.sh`.

## HTTPS 전환 순서 (도메인 유무 무관, 순서 준수)

되돌리기 어려운 `Secure` 쿠키·HSTS 는 **HTTPS 정상 동작을 확인한 뒤** 켠다.

1. **스테이징(도메인 전)** — 자체서명 인증서로 전 체인 검증. `ENABLE_HSTS=false`.
   ```bash
   cp .env.docker.example .env.docker      # 시크릿 채우기
   docker compose --env-file .env.docker up -d --build
   # → https://localhost  (자체서명: 브라우저 경고 1회 허용)
   ```
   검증: 로그인 → refresh 쿠키(`Secure`) → 새로고침 세션 유지 → 로그아웃 → `#share` 공개링크 열림.
2. **운영(도메인 구매 후)** — `SERVER_NAME=실도메인`, 자체서명을 **실인증서(Let's Encrypt/certbot 등)로 교체**해 `certs` 볼륨의 `fullchain.pem`/`privkey.pem` 로 넣는다. `CORS_ORIGIN=https://실도메인`.
3. **HSTS 점진 강화** — HTTPS 정상 확인 후 `ENABLE_HSTS=true` + `HSTS_MAX_AGE` 를 짧게(300)→길게(31536000)→(확신 시)`includeSubDomains`/preload.
4. **평문 차단 확인** — 80 은 443 리다이렉트 전용(구성 반영됨).

> 프론트는 상대경로 `/api` + `location.origin` 기반이라 혼합콘텐츠 없음 — 코드 변경 불필요.

## 참고 — 이미 적용된 것
- 비밀번호 **scrypt** 해시(SHA-256 아님), refresh 토큰 SHA-256 해시 저장·회전·재사용 탐지
- 보안 헤더(X-Frame-Options·X-Content-Type-Options·Referrer-Policy·X-Robots-Tag), 로그인·공개링크 rate-limit
- 게시 링크 토큰 만료·폐기, 검색 색인 차단(noindex/robots)
