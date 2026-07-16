// =====================================================================
// remediationGuides.js — 조치 가이드 '일반 방향'(direction/steps) 단일 소스(SSOT).
//  · 백엔드 lab.js(run.guide 조립) + 프론트 조치 가이드(GuideSteps 마무리)가 공유.
//  · 순수 데이터 + 문자열 정규화만 — node/브라우저 의존 없음(양쪽 번들 안전).
//  · issue_type 변형/별칭 → 대표 가이드 키 매핑은 guideKey() 로 통일.
// =====================================================================

export const GUIDES = {
  hsts_incorrect: { direction: '웹서버/프록시/CDN 등 응답 헤더 제어 구간에서 Strict-Transport-Security 적용을 검토.', steps: ['HTTPS 전구간 정상 여부 확인', 'max-age·includeSubDomains 단계 적용', 'preload는 비가역성 유의'] },
  cookie_missing_http_only: { direction: '세션 쿠키에 HttpOnly/Secure/SameSite 속성 부여 검토.', steps: ['Set-Cookie에 HttpOnly 추가', 'HTTPS에서 Secure 추가', 'SameSite=Lax/Strict 검토'] },
  csp_no_policy: { direction: 'Content-Security-Policy를 Report-Only로 관측 후 단계적 강화.', steps: ['CSP-Report-Only로 위반 수집', '인라인/외부 출처 목록화', '정책 강화 전 주요 플로우 테스트'] },
  csp_unsafe: { direction: "CSP의 'unsafe-inline'/'unsafe-eval' 제거 — 인라인 스크립트를 nonce/hash 로 전환.", steps: ["script-src 에서 'unsafe-inline'·'unsafe-eval' 제거", '인라인 스크립트를 외부 파일 또는 nonce/hash 로 이전', 'Report-Only 로 위반 확인 후 강제 적용'] },
  csp_too_broad: { direction: "CSP의 광범위 지시자(default-src * 등)를 출처 최소화로 축소.", steps: ["default-src 를 'self' 로 좁히고 필요한 출처만 명시적으로 허용", '와일드카드(*)·data:/blob: 남용 제거', 'Report-Only 로 정상 동작 확인 후 강제 적용'] },
  x_content_type_options: { direction: 'X-Content-Type-Options: nosniff 헤더를 적용해 MIME 스니핑을 방지.', steps: ['응답 헤더에 X-Content-Type-Options: nosniff 추가', '정적/동적 응답 모두 적용 확인', '재스캔으로 확인'] },
  x_frame_options: { direction: 'X-Frame-Options(또는 CSP frame-ancestors) 적용해 클릭재킹 방지.', steps: ['X-Frame-Options: SAMEORIGIN 또는 DENY 적용', "가능하면 CSP frame-ancestors 'self' 병행", '재스캔으로 확인'] },
  x_xss_protection: { direction: 'X-XSS-Protection 헤더 적용(최신 권장: CSP 도입 + X-XSS-Protection: 0).', steps: ['X-XSS-Protection 헤더 설정', '근본 방어로 CSP 도입 권장', '재스캔으로 확인'] },
  tls_weak_cipher: { direction: '취약 cipher suite 비활성화, 권장 스위트만 허용.', steps: ['서버 cipher 목록 점검', '약한 스위트 제거', '재스캔으로 확인'] },
  tlscert_excessive_expiration: { direction: '인증서 유효기간을 권장 수준(단기)으로 재발급.', steps: ['현재 만료일(notAfter) 확인', '단기 유효 인증서로 재발급', 'ACME 등 자동 갱신 구성 · 만료 모니터링'] },
  tlscert_no_revocation: { direction: '인증서 폐지 확인 수단(OCSP Stapling/CRL) 구성.', steps: ['OCSP Stapling 활성화', 'CRL 배포지점(CDP) 확인', '체인/폐지 응답 검증'] },
  tlscert_revoked: { direction: '폐지된 인증서를 즉시 교체 — CA에서 유효한 새 인증서를 재발급해 배포.', steps: ['현재 인증서 폐지 여부 확인(openssl verify -crl_check / OCSP)', 'CA에서 새 인증서 재발급', '전체 체인 교체 후 재스캔으로 유효 확인'] },
  cert_key_size: { direction: '약한 키 크기 인증서를 권장 강도로 재발급.', steps: ['현재 키 크기/알고리즘 확인', 'RSA 2048비트 이상 또는 ECDSA(P-256)로 재발급', '재스캔으로 확인'] },
  tlscert_self_signed: { direction: '자체서명 인증서를 신뢰 CA(공개 CA 또는 내부 PKI)가 발급한 인증서로 교체.', steps: ['공개 CA(Let\'s Encrypt 등) 또는 내부 PKI로 발급', '전체 인증서 체인 배포', '재스캔으로 확인'] },
  tlscert_weak_signature: { direction: '약한 해시(SHA-1/MD5)로 서명된 인증서를 SHA-256 이상 서명으로 재발급.', steps: ['현재 서명 알고리즘 확인(openssl x509 -text 의 Signature Algorithm)', 'CA에 SHA-256 이상(sha256WithRSAEncryption/ECDSA) 서명으로 재발급 요청', '전체 체인 교체 후 재스캔으로 확인'] },
  spf_record_missing: { direction: '발신 서버를 명시하는 SPF TXT 레코드와 DMARC 정책 추가.', steps: ['SPF TXT 작성', 'DMARC(p=quarantine/reject) 단계 적용', 'DKIM 서명 병행'] },
  service_pptp: { direction: '노후·취약 VPN(PPTP) 비활성화 및 안전한 VPN으로 이전.', steps: ['PPTP(1723) 필요성 검토', '서비스 비활성/차단', '대체 VPN 적용'] },
  open_port: { direction: '불필요 노출 포트 차단, 방화벽/보안그룹 최소권한.', steps: ['노출 포트 목록화', '불필요 포트 차단', '재스캔 확인'] },
  // 헤더 — 서버/기술스택 노출, HTTPS 리다이렉트
  server_exposure: { direction: '서버 버전·기술스택 노출을 최소화(서버 토큰/기술 헤더 제거).', steps: ['nginx server_tokens off / Apache ServerTokens Prod', 'X-Powered-By 등 기술스택 헤더 제거', '역프록시/미들웨어에서 노출 헤더 정리'] },
  insecure_https_redirect: { direction: 'HTTP를 HTTPS로 안전하게 리다이렉트(301) 후 HSTS 병행.', steps: ['80→443 301 영구 리다이렉트 구성', '리다이렉트 후 HSTS 적용', '혼합 콘텐츠(mixed content) 점검'] },
  // TLS — 프로토콜
  tls_weak_protocol: { direction: '구버전 TLS(1.0/1.1) 비활성화, TLS 1.2 이상만 허용.', steps: ['서버 허용 프로토콜 점검', 'TLSv1.0/1.1 비활성화', 'TLSv1.2+ 만 허용 후 재스캔'] },
  ssh_weak_cipher: { direction: 'SSH 취약 cipher(CBC/3DES/arcfour) 비활성화, AEAD/CTR만 허용.', steps: ['sshd_config Ciphers 점검', 'CBC/3DES/RC4 제거', 'chacha20-poly1305/aes-gcm/aes-ctr 만 허용 후 재스캔'] },
  ssh_weak_protocol: { direction: 'SSH 취약 KEX/MAC(SHA1·MD5) 비활성화, 강한 알고리즘만 허용.', steps: ['sshd_config KexAlgorithms·MACs 점검', 'sha1/md5 기반 제거', 'curve25519·group16-sha512·ETM MAC 만 허용 후 재스캔'] },
  // DNS/메일 — DMARC, DKIM
  dmarc_record_missing: { direction: '_dmarc TXT에 DMARC 정책(p=quarantine/reject) 게시.', steps: ['SPF/DKIM 정렬 확인', 'DMARC p=none 으로 관측 시작', 'rua 리포트 확인 후 p=quarantine/reject 상향'] },
  dkim_record_missing: { direction: '메일 서명용 DKIM 키를 생성해 selector TXT로 게시.', steps: ['DKIM 키쌍 생성', 'selector._domainkey TXT 게시', '발신 서버 DKIM 서명 활성화'] },
  spf_record_malformed: { direction: 'SPF TXT 레코드의 구문 오류를 수정(유효한 mechanism + -all).', steps: ['현재 SPF 구문 검증(도구/파서)', 'include:/ip4:/mx 등 올바른 mechanism 사용', '끝에 -all 적용 후 재확인'] },
  dmarc_policy: { direction: 'DMARC 정책을 p=none(모니터링)에서 p=quarantine/reject로 상향.', steps: ['rua 리포트로 SPF/DKIM 정렬 확인', 'p=quarantine 로 상향', '안정화 후 p=reject 검토'] },
  dkim_key: { direction: '약한/짧은 DKIM 키를 권장 강도(RSA 2048비트)로 재발급.', steps: ['현재 DKIM 키 길이/알고리즘 확인', 'RSA 2048비트로 키쌍 재생성', 'selector._domainkey TXT 갱신 후 서명 전환'] },
  // 네트워크 — 평문/원격 접속 서비스
  insecure_telnet: { direction: '평문 Telnet(23) 비활성화, SSH로 대체.', steps: ['Telnet 필요성 검토', '서비스 비활성/차단', 'SSH(22)로 전환'] },
  insecure_ftp: { direction: '평문 FTP(21) 비활성화, SFTP/FTPS로 대체.', steps: ['FTP 필요성 검토', '서비스 비활성/차단', 'SFTP/FTPS로 전환'] },
  service_rdp: { direction: 'RDP(3389) 직접 노출 제거 — VPN/게이트웨이 뒤로 이동.', steps: ['RDP 외부 노출 검토', 'VPN/제로트러스트 게이트웨이 뒤로 이동', 'NLA·MFA 적용'] },
  exposed_service: { direction: '외부에 불필요하게 노출된 서비스를 차단/내부화하고 인증·최소권한 적용.', steps: ['해당 포트 노출 필요성 검토', '방화벽/보안그룹에서 차단 또는 내부망/VPN 뒤로 이동', '인증·접근제어 적용 후 재스캔'] }
}
// issue_type(변형/별칭 포함) → 대표 가이드 키 (예: content_security_policy_missing → csp_no_policy)
export function guideKey(issueType) {
  const t = String(issueType || '').toLowerCase()
  // 헤더 (server_version/tokens는 'insecure_server_certificate_key_size'와 겹치지 않게 구체 매칭)
  if (t.includes('hsts')) return 'hsts_incorrect'
  if (t.includes('csp') && t.includes('unsafe')) return 'csp_unsafe'
  if (t.includes('csp') && t.includes('broad')) return 'csp_too_broad'
  if (t.includes('csp') || t.includes('content_security')) return 'csp_no_policy'
  if (t.includes('cookie')) return 'cookie_missing_http_only'
  if (t.includes('x_content_type') || t.includes('content_type_options')) return 'x_content_type_options'
  if (t.includes('x_frame') || t.includes('clickjack')) return 'x_frame_options'
  if (t.includes('x_xss')) return 'x_xss_protection'
  if (t.includes('x_powered_by') || t.includes('server_version') || t.includes('server_tokens')) return 'server_exposure'
  if (t.includes('redirect')) return 'insecure_https_redirect'
  // TLS/인증서 (key_size·revocation을 cert/expiration보다 먼저)
  if (t.includes('key_size')) return 'cert_key_size'
  if (t.includes('self_signed')) return 'tlscert_self_signed'
  if (t.includes('signature') && t.includes('cert')) return 'tlscert_weak_signature' // dkim_weak_signature(cert 없음)와 구분
  if (t.includes('revoked')) return 'tlscert_revoked' // 'cert' 매칭보다 먼저 — 폐지됨
  if (t.includes('revocation')) return 'tlscert_no_revocation'
  if (t.includes('ssh') && t.includes('cipher')) return 'ssh_weak_cipher'
  if (t.includes('ssh') && t.includes('protocol')) return 'ssh_weak_protocol'
  if (t.includes('protocol')) return 'tls_weak_protocol'
  if (t.includes('cipher')) return 'tls_weak_cipher'
  if (t.includes('expiration') || t.includes('expired') || t.includes('cert')) return 'tlscert_excessive_expiration'
  // DNS/메일
  if (t.includes('spf') && t.includes('malformed')) return 'spf_record_malformed'
  if (t.includes('dmarc') && t.includes('none')) return 'dmarc_policy'
  if (t.includes('dmarc')) return 'dmarc_record_missing'
  if (t.includes('dkim') && (t.includes('weak') || t.includes('key_length') || t.includes('insufficient'))) return 'dkim_key'
  if (t.includes('dkim')) return 'dkim_record_missing'
  if (t.includes('spf')) return 'spf_record_missing'
  // 네트워크 (평문/원격접속은 개별, 그 외 포트는 일반 차단)
  if (t.includes('pptp')) return 'service_pptp'
  if (t.includes('telnet')) return 'insecure_telnet'
  if (t.includes('ftp')) return 'insecure_ftp'
  if (t.includes('rdp')) return 'service_rdp'
  if (t.includes('port') || t.includes('vnc') || t.includes('service_dns')) return 'open_port'
  // 그 외 노출 서비스(mysql/redis/mongo/elastic/smb/ldap/imap/couch/cassandra/proxy 등)
  if (t.includes('service_') || t.includes('mysql') || t.includes('redis') || t.includes('mongo') || t.includes('elastic') || t.includes('smb') || t.includes('ldap') || t.includes('imap') || t.includes('couch') || t.includes('cassandra') || t.includes('proxy')) return 'exposed_service'
  return null
}
