// =====================================================================
// Validation Sandbox — 지원 issue type 카탈로그 (SSC metadata 매핑)
//  - A. SSC 전체 catalog(/metadata/issue-types)의 subset.
//  - B. 파트너 표준 검증랩에서 재현 가능 + 고객 조치 가이드 가능 항목만.
//  - 각 항목: SSC 매핑 메타 + 조치 위치(whereToChange) + config diff + 검증 명령.
//  - configDiff.lines: { t: 'ctx'|'add'|'del', s: '...' }  (참고용 스니펫)
// =====================================================================

const D = (label, file, lines) => ({ label, file, lines })
const L = (arr) => arr // helper for readability

// 노출 서비스 이슈(데이터 주도 생성) — [key, 이름, 포트, 위험, 대체/조치]
const NET_SVC = [
  ['service_ftp', 'FTP', 21, '평문 자격증명·파일 유출', 'SFTP/FTPS로 전환'],
  ['service_telnet', 'Telnet', 23, '평문 원격접속 탈취', 'SSH로 전환'],
  ['service_ldap', 'LDAP', 389, '디렉터리 정보 유출', '내부망/VPN, 익명 바인딩 금지'],
  ['service_ldap_anonymous', 'LDAP(익명)', 389, '인증 없는 디렉터리 조회', '익명 바인딩 비활성화'],
  ['service_smb', 'SMB', 445, '파일공유 취약점·랜섬웨어', 'SMB 인터넷 노출 차단'],
  ['service_mysql', 'MySQL', 3306, 'DB 직접 노출·무단 접근', '내부망/VPN·인증·접근제어'],
  ['service_redis', 'Redis', 6379, '인증 없는 캐시 접근', 'bind 제한·requirepass'],
  ['service_mongodb', 'MongoDB', 27017, 'DB 직접 노출', 'bind 제한·인증'],
  ['service_elasticsearch', 'Elasticsearch', 9200, '색인 데이터 노출', '내부망·인증'],
  ['service_couchdb', 'CouchDB', 5984, 'DB 직접 노출', '내부망·인증'],
  ['service_cassandra', 'Cassandra', 9042, 'DB 직접 노출', '내부망·인증'],
  ['service_imap', 'IMAP', 143, '평문 메일 접근', 'TLS(993)·노출 제한'],
  ['service_http_proxy', 'HTTP Proxy', 8080, '오픈 프록시 악용', '프록시 노출 차단·인증']
]
const svcName = (n) => n.replace(/\(.*\)/, '').toLowerCase()
const NET_SVC_ENTRIES = NET_SVC.map(([key, name, port, why, fix]) => ({
  key, display_name: `${name} Service Exposed`, category: 'Network Service', ssc_factor: 'network_security',
  severity: 'medium', collector_type: 'scan_report', evidence_mode: 'before_after_scan_and_source',
  remediation_mode: 'network_control', source_config_targets: ['firewall', 'cloud_security_group', 'service_config'],
  why: `${name}(${port}) 서비스가 인터넷에 노출되면 ${why} 위험이 있습니다.`,
  whereToChange: [`방화벽/보안그룹에서 tcp/${port} 차단`, '서비스 비활성/내부망 이전', fix],
  configDiff: D('port state', 'firewall / security group', [
    { t: 'del', s: `${port}/tcp open  ${svcName(name)}` },
    { t: 'add', s: `${port}/tcp filtered` }
  ]),
  verification: [`nmap -p ${port} {host}`]
}))
const NET_SVC_KO = Object.fromEntries(NET_SVC.map(([key, name]) => [key, `${name} 서비스 노출`]))

export const SANDBOX_CATALOG = [
  // ── HTTP/Web Header ──────────────────────────────────────────────
  {
    key: 'hsts_incorrect',
    display_name: 'HSTS Incorrect',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'medium',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'web_server_config',
    source_config_targets: ['nginx', 'apache', 'iis', 'reverse_proxy', 'application_middleware'],
    why: 'Strict-Transport-Security 헤더가 없거나 부적절하면 브라우저가 HTTP로 접속을 시도할 수 있어 다운그레이드/중간자 위험이 증가합니다.',
    whereToChange: ['웹서버(nginx add_header / Apache Header always set / IIS HTTP Response Headers)', 'Reverse Proxy / CDN header rule'],
    configDiff: D('nginx.conf (또는 reverse proxy)', 'nginx.conf', [
      { t: 'ctx', s: 'server {' },
      { t: 'ctx', s: '    listen 443 ssl;' },
      { t: 'ctx', s: '    server_name example.com;' },
      { t: 'add', s: '    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' },
      { t: 'ctx', s: '}' }
    ]),
    verification: ['curl -I https://{endpoint}', 'browser devtools → Response Headers 에서 Strict-Transport-Security 확인']
  },
  {
    key: 'cookie_missing_http_only',
    display_name: 'Cookie Missing HttpOnly',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'high',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'application_config',
    source_config_targets: ['application_middleware', 'framework_cookie_setting', 'reverse_proxy_cookie_rewrite'],
    why: '세션 쿠키에 HttpOnly가 없으면 XSS 등으로 스크립트가 쿠키에 접근할 수 있어 세션 탈취 위험이 커집니다. (raw cookie 값은 노출하지 않고 flag 존재 여부만 표기)',
    whereToChange: ['애플리케이션 세션 쿠키 옵션', '프레임워크 cookie 설정', 'Reverse Proxy cookie rewrite'],
    configDiff: D('Set-Cookie (값은 마스킹)', 'application session cookie', [
      { t: 'del', s: 'Set-Cookie: sessionid=***; Path=/; Secure' },
      { t: 'add', s: 'Set-Cookie: sessionid=***; Path=/; Secure; HttpOnly; SameSite=Lax' }
    ]),
    verification: ['curl -I https://{endpoint}  (Set-Cookie 플래그 확인)', 'browser devtools → Application → Cookies 에서 HttpOnly 확인']
  },
  {
    key: 'cookie_missing_secure_attribute',
    display_name: 'Cookie Missing Secure Attribute',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'medium',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'application_config',
    source_config_targets: ['framework_cookie_config', 'application_middleware', 'reverse_proxy'],
    why: '세션 쿠키에 Secure가 없으면 평문(HTTP) 채널로 쿠키가 전송될 수 있습니다. (raw cookie 마스킹 필수)',
    whereToChange: ['프레임워크 cookie 설정', 'application middleware', 'Reverse Proxy'],
    configDiff: D('Set-Cookie (값은 마스킹)', 'application session cookie', [
      { t: 'del', s: 'Set-Cookie: sessionid=***; Path=/; HttpOnly' },
      { t: 'add', s: 'Set-Cookie: sessionid=***; Path=/; HttpOnly; Secure; SameSite=Lax' }
    ]),
    verification: ['curl -I https://{endpoint}', 'browser devtools → Application → Cookies 에서 Secure 확인']
  },
  {
    key: 'csp_no_policy',
    display_name: 'CSP Missing',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'medium',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'web_server_config',
    source_config_targets: ['nginx', 'apache', 'iis', 'reverse_proxy', 'application_middleware'],
    why: 'Content-Security-Policy가 없으면 스크립트 인젝션의 영향 범위를 제한하기 어렵습니다. Report-Only로 관측 후 단계적으로 강화하는 것이 권장됩니다.',
    whereToChange: ['웹서버 add_header', 'Reverse Proxy / CDN', 'application middleware'],
    configDiff: D('nginx.conf', 'nginx.conf', [
      { t: 'ctx', s: 'server {' },
      { t: 'add', s: '    add_header Content-Security-Policy-Report-Only "default-src \'self\'" always;  # 관측 후' },
      { t: 'add', s: '    # add_header Content-Security-Policy "default-src \'self\'" always;         # 강화 시' },
      { t: 'ctx', s: '}' }
    ]),
    verification: ['curl -I https://{endpoint}', 'browser devtools → Response Headers 에서 Content-Security-Policy 확인']
  },
  {
    key: 'csp_unsafe_policy',
    display_name: "CSP Contains 'unsafe-*' Directive",
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'low',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'web_server_config',
    source_config_targets: ['nginx', 'apache', 'iis', 'reverse_proxy', 'application_middleware'],
    why: "CSP에 'unsafe-inline'/'unsafe-eval'이 있으면 정책이 존재해도 인라인 스크립트가 실행되어 XSS 방어가 무력화됩니다. nonce/hash 로 전환하고 unsafe-* 를 제거하세요.",
    whereToChange: ['웹서버 add_header (script-src)', '인라인 스크립트를 nonce/hash 로 전환'],
    configDiff: D('nginx.conf', 'nginx.conf', [
      { t: 'del', s: "    add_header Content-Security-Policy \"...; script-src 'self' 'unsafe-inline' 'unsafe-eval'\" always;" },
      { t: 'add', s: "    add_header Content-Security-Policy \"...; script-src 'self'\" always;" }
    ]),
    verification: ['curl -I https://{endpoint} | grep -i content-security-policy']
  },
  {
    key: 'csp_too_broad',
    display_name: 'CSP Contains Broad Directives',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'low',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'web_server_config',
    source_config_targets: ['nginx', 'apache', 'iis', 'reverse_proxy', 'application_middleware'],
    why: "CSP에 광범위 지시자(default-src * 등)가 있으면 임의 출처의 리소스 로드를 허용해 정책 효과가 사라집니다. 출처를 'self' 및 필요한 것만으로 좁히세요.",
    whereToChange: ['웹서버 add_header (default-src/script-src)', '와일드카드(*) 출처 제거'],
    configDiff: D('nginx.conf', 'nginx.conf', [
      { t: 'del', s: "    add_header Content-Security-Policy \"default-src * data: blob: 'unsafe-inline'\" always;" },
      { t: 'add', s: "    add_header Content-Security-Policy \"default-src 'self'; object-src 'none'\" always;" }
    ]),
    verification: ['curl -I https://{endpoint} | grep -i content-security-policy']
  },
  {
    key: 'insecure_https_redirect_pattern',
    display_name: 'Insecure HTTPS Redirect Pattern',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'low',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'web_server_config',
    source_config_targets: ['nginx', 'apache', 'iis', 'reverse_proxy'],
    why: 'HTTP 요청을 302(임시)로 또는 HTTP 목적지로 리다이렉트하면 암호화되지 않은 경로가 노출됩니다. 301(영구)로 HTTPS 목적지에 직접 리다이렉트하고 HSTS를 병행하세요.',
    whereToChange: ['웹서버 리다이렉트 규칙(80→443, 301)', 'HTTPS 목적지·HSTS 병행'],
    configDiff: D('nginx.conf', 'nginx.conf', [
      { t: 'del', s: '    return 302 http://$host$request_uri;' },
      { t: 'add', s: '    return 301 https://$host$request_uri;' }
    ]),
    verification: ['curl -sSI http://{endpoint}  (Status 301 · Location https:// 확인)']
  },
  {
    key: 'x_content_type_options_incorrect_v2',
    display_name: 'X-Content-Type-Options Not Implemented',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'low',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'web_server_config',
    source_config_targets: ['nginx', 'apache', 'iis', 'reverse_proxy'],
    why: 'X-Content-Type-Options: nosniff 가 없으면 브라우저 MIME 스니핑으로 콘텐츠 유형을 오해석해 XSS 등 위험이 커질 수 있습니다.',
    whereToChange: ['웹서버 add_header', 'Reverse Proxy / CDN'],
    configDiff: D('nginx.conf', 'nginx.conf', [
      { t: 'add', s: '    add_header X-Content-Type-Options "nosniff" always;' }
    ]),
    verification: ['curl -I https://{endpoint}  (X-Content-Type-Options 확인)']
  },
  {
    key: 'x_frame_options_incorrect_v2',
    display_name: 'X-Frame-Options Not Implemented (Clickjacking)',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'low',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'web_server_config',
    source_config_targets: ['nginx', 'apache', 'iis', 'reverse_proxy'],
    why: 'X-Frame-Options(또는 CSP frame-ancestors)가 없으면 페이지가 iframe에 삽입되어 클릭재킹 공격에 노출될 수 있습니다.',
    whereToChange: ['웹서버 add_header', "CSP frame-ancestors 'self' 병행"],
    configDiff: D('nginx.conf', 'nginx.conf', [
      { t: 'add', s: '    add_header X-Frame-Options "SAMEORIGIN" always;' }
    ]),
    verification: ['curl -I https://{endpoint}  (X-Frame-Options 확인)']
  },
  {
    key: 'x_xss_protection_incorrect_v2',
    display_name: 'X-XSS-Protection Not Implemented',
    category: 'HTTP/Web Header',
    ssc_factor: 'application_security',
    severity: 'info',
    collector_type: 'web_screenshot',
    evidence_mode: 'before_after_header_and_source',
    remediation_mode: 'web_server_config',
    source_config_targets: ['nginx', 'apache', 'iis', 'reverse_proxy'],
    why: 'X-XSS-Protection 헤더 미설정. (참고: 최신 브라우저는 이 헤더 대신 CSP로 XSS를 방어 — 근본 대책은 CSP 도입)',
    whereToChange: ['웹서버 add_header', '근본 대책: CSP 도입'],
    configDiff: D('nginx.conf', 'nginx.conf', [
      { t: 'add', s: '    add_header X-XSS-Protection "1; mode=block" always;' }
    ]),
    verification: ['curl -I https://{endpoint}  (X-XSS-Protection 확인)']
  },

  // ── TLS/Certificate ──────────────────────────────────────────────
  {
    key: 'tls_weak_protocol',
    display_name: 'TLS Weak Protocol',
    category: 'TLS/Certificate',
    ssc_factor: 'network_security',
    severity: 'high',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'tls_config',
    source_config_targets: ['nginx', 'apache', 'load_balancer_tls_policy', 'cdn_tls_policy'],
    why: 'TLS 1.0/1.1은 알려진 약점이 있어 TLS 1.2/1.3만 허용하는 것이 권장됩니다.',
    whereToChange: ['nginx ssl_protocols', 'Apache SSLProtocol', 'Load Balancer TLS policy'],
    configDiff: D('nginx ssl_protocols', 'nginx.conf', [
      { t: 'del', s: 'ssl_protocols TLSv1 TLSv1.1 TLSv1.2;' },
      { t: 'add', s: 'ssl_protocols TLSv1.2 TLSv1.3;' }
    ]),
    verification: ['nmap --script ssl-enum-ciphers -p {port} {host}', 'openssl s_client -connect {host}:{port} -tls1_1  (거부 확인)']
  },
  {
    key: 'tls_weak_cipher',
    display_name: 'TLS Weak Cipher',
    category: 'TLS/Certificate',
    ssc_factor: 'network_security',
    severity: 'high',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'tls_config',
    source_config_targets: ['nginx', 'load_balancer_security_policy', 'cdn_tls_policy'],
    why: '취약 cipher suite 허용은 암호화 강도를 떨어뜨립니다. 권장 스위트만 허용하세요.',
    whereToChange: ['nginx ssl_ciphers', 'Load Balancer security policy', 'CDN TLS policy'],
    configDiff: D('nginx ssl_ciphers', 'nginx.conf', [
      { t: 'del', s: 'ssl_ciphers HIGH:MEDIUM:!aNULL;' },
      { t: 'add', s: 'ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...;' }
    ]),
    verification: ['nmap --script ssl-enum-ciphers -p {port} {host}']
  },
  {
    key: 'tlscert_excessive_expiration',
    display_name: 'Certificate Excessive Expiration',
    category: 'TLS/Certificate',
    ssc_factor: 'network_security',
    severity: 'low',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'tls_config',
    source_config_targets: ['certificate_authority', 'acme_automation', 'load_balancer_tls_policy'],
    why: '유효기간이 과도하게 긴 인증서는 키 노출 시 위험 노출 기간이 길어집니다. 단기 인증서+자동 갱신이 권장됩니다.',
    whereToChange: ['인증서 재발급(권장 유효기간)', 'ACME/자동 갱신 구성', 'Load Balancer TLS policy'],
    configDiff: D('certificate validity', 'openssl / ACME', [
      { t: 'del', s: 'notAfter: 3650 days (excessive)' },
      { t: 'add', s: 'notAfter: 90 days (compliant, auto-renew)' }
    ]),
    verification: ['openssl s_client -connect {host}:{port} | openssl x509 -noout -dates']
  },
  {
    key: 'tlscert_self_signed',
    display_name: 'Certificate Is Self-Signed',
    category: 'TLS/Certificate',
    ssc_factor: 'network_security',
    severity: 'low',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'tls_config',
    source_config_targets: ['certificate_authority', 'internal_pki', 'acme_automation'],
    why: '자체서명 인증서(issuer == subject)는 제3자 신뢰가 없어 중간자 공격 탐지가 어렵고 브라우저 경고가 발생합니다.',
    whereToChange: ['공개 CA(Let\'s Encrypt 등) 발급', '내부 PKI로 발급 후 체인 배포'],
    configDiff: D('certificate issuer', 'openssl / ACME', [
      { t: 'del', s: 'issuer == subject  (self-signed)' },
      { t: 'add', s: 'issuer = 신뢰 CA (issuer != subject)' }
    ]),
    verification: ['openssl s_client -connect {host}:{port} | openssl x509 -noout -issuer -subject']
  },
  {
    key: 'tlscert_weak_signature',
    display_name: 'Certificate Signed With Weak Algorithm',
    category: 'TLS/Certificate',
    ssc_factor: 'network_security',
    severity: 'low',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'tls_config',
    source_config_targets: ['certificate_authority', 'reissue_sha256'],
    why: '약한 해시(SHA-1/MD5)로 서명된 인증서는 충돌 공격에 취약해 위조 가능성이 있어 최신 브라우저·클라이언트가 신뢰하지 않습니다.',
    whereToChange: ['CA에 SHA-256 이상 서명으로 재발급 요청', '재발급 인증서로 전체 체인 교체'],
    configDiff: D('certificate signature algorithm', 'openssl / CA', [
      { t: 'del', s: 'Signature Algorithm: sha1WithRSAEncryption  (weak)' },
      { t: 'add', s: 'Signature Algorithm: sha256WithRSAEncryption  (strong)' }
    ]),
    verification: ['openssl s_client -connect {host}:{port} | openssl x509 -noout -text | grep "Signature Algorithm"']
  },
  {
    key: 'tlscert_revoked',
    display_name: 'Certificate Is Revoked',
    category: 'TLS/Certificate',
    ssc_factor: 'network_security',
    severity: 'high',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'tls_config',
    source_config_targets: ['certificate_authority', 'reissue'],
    why: '폐지된(revoked) 인증서는 CA가 신뢰를 철회한 것으로, 유출·오발급 등의 사유가 있어 클라이언트가 연결을 거부하거나 경고합니다. 즉시 유효한 인증서로 재발급·교체해야 합니다.',
    whereToChange: ['CA에서 유효한 새 인증서 재발급', '전체 체인 교체 후 CRL/OCSP로 유효 확인'],
    configDiff: D('certificate revocation status', 'openssl / CA', [
      { t: 'del', s: 'openssl verify -crl_check → error 23: certificate revoked' },
      { t: 'add', s: 'openssl verify -crl_check → valid.crt: OK' }
    ]),
    verification: ['openssl verify -crl_check -CAfile ca.crt -CRLfile crl.pem {cert}']
  },

  // ── SSH ──────────────────────────────────────────────────────────
  {
    key: 'ssh_weak_cipher',
    display_name: 'SSH Supports Weak Cipher',
    category: 'SSH',
    ssc_factor: 'network_security',
    severity: 'medium',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'ssh_config',
    source_config_targets: ['sshd_config', 'ssh_server'],
    why: 'SSH가 CBC/3DES/arcfour 등 취약 cipher를 허용하면 암호화 강도가 낮아 공격에 노출됩니다. AEAD/CTR 계열만 허용하세요.',
    whereToChange: ['sshd_config Ciphers', 'SSH 서버 재시작'],
    configDiff: D('sshd_config', 'sshd_config', [
      { t: 'del', s: 'Ciphers 3des-cbc,aes128-cbc,aes128-ctr' },
      { t: 'add', s: 'Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes256-ctr' }
    ]),
    verification: ['nmap --script ssh2-enum-algos -p 22 {host}']
  },
  {
    key: 'ssh_weak_protocol',
    display_name: 'SSH Supports Vulnerable Protocol/KEX',
    category: 'SSH',
    ssc_factor: 'network_security',
    severity: 'medium',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'ssh_config',
    source_config_targets: ['sshd_config', 'ssh_server'],
    why: 'SSH가 SHA1 기반 KEX나 MD5/SHA1 MAC 등 취약 알고리즘을 허용하면 다운그레이드/무결성 공격 위험이 있습니다.',
    whereToChange: ['sshd_config KexAlgorithms·MACs', 'SSH 서버 재시작'],
    configDiff: D('sshd_config', 'sshd_config', [
      { t: 'del', s: 'KexAlgorithms diffie-hellman-group14-sha1,...' },
      { t: 'add', s: 'KexAlgorithms curve25519-sha256,diffie-hellman-group16-sha512' }
    ]),
    verification: ['nmap --script ssh2-enum-algos -p 22 {host}']
  },

  // ── DNS/Email ────────────────────────────────────────────────────
  {
    key: 'spf_record_missing',
    display_name: 'SPF Record Missing',
    category: 'DNS/Email',
    ssc_factor: 'dns_health',
    severity: 'low',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'dns_record',
    source_config_targets: ['dns_provider', 'zone_file', 'txt_record'],
    why: 'SPF TXT 레코드가 없으면 발신 도메인 스푸핑 방어가 약해집니다. DMARC와 병행 권장.',
    whereToChange: ['DNS provider', 'zone file', 'TXT record'],
    configDiff: D('DNS TXT Record', 'zone file', [
      { t: 'del', s: 'TXT @ : Not Present' },
      { t: 'add', s: 'TXT @ : "v=spf1 include:_spf.example.com -all"' }
    ]),
    verification: ['dig TXT {host}', 'nslookup -type=TXT {host}']
  },
  {
    key: 'dmarc_record_missing',
    display_name: 'DMARC Record Missing',
    category: 'DNS/Email',
    ssc_factor: 'dns_health',
    severity: 'low',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'dns_record',
    source_config_targets: ['dns_provider', '_dmarc_txt_record'],
    why: '_dmarc TXT가 없으면 SPF/DKIM 실패 처리 정책을 지정할 수 없습니다.',
    whereToChange: ['DNS provider', '_dmarc TXT record'],
    configDiff: D('DNS TXT Record', 'zone file', [
      { t: 'del', s: 'TXT _dmarc : Not Present' },
      { t: 'add', s: 'TXT _dmarc : "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"' }
    ]),
    verification: ['dig TXT _dmarc.{host}']
  },
  {
    key: 'spf_record_malformed',
    display_name: 'Malformed SPF Record',
    category: 'DNS/Email',
    ssc_factor: 'dns_health',
    severity: 'medium',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'dns_record',
    source_config_targets: ['dns_provider', 'zone_file', 'txt_record'],
    why: 'SPF 구문 오류(permerror)는 수신 서버가 정책을 적용하지 못하게 해 사실상 스푸핑 방어가 무력화됩니다.',
    whereToChange: ['DNS provider', 'SPF TXT 구문 수정'],
    configDiff: D('DNS TXT Record', 'zone file', [
      { t: 'del', s: 'TXT @ : "v=spf1 include -all"   # include 뒤 도메인 누락' },
      { t: 'add', s: 'TXT @ : "v=spf1 include:_spf.example.com -all"' }
    ]),
    verification: ['dig +short TXT {host}  (SPF 구문 확인)']
  },
  {
    key: 'dmarc_contains_none',
    display_name: 'DMARC Record Contains None Policy',
    category: 'DNS/Email',
    ssc_factor: 'dns_health',
    severity: 'low',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'dns_record',
    source_config_targets: ['dns_provider', '_dmarc_txt_record'],
    why: 'DMARC p=none은 모니터링만 하고 실패 메일을 처리하지 않아, 위조 메일이 그대로 수신됩니다. p=quarantine/reject로 상향 필요.',
    whereToChange: ['DNS provider', '_dmarc TXT 정책 상향'],
    configDiff: D('DNS TXT Record', 'zone file', [
      { t: 'del', s: 'TXT _dmarc : "v=DMARC1; p=none; ..."' },
      { t: 'add', s: 'TXT _dmarc : "v=DMARC1; p=quarantine; ..."' }
    ]),
    verification: ['dig +short TXT _dmarc.{host}  (p= 정책 확인)']
  },
  {
    key: 'subdomain_dmarc_contains_none',
    display_name: 'Subdomain DMARC Contains None Policy',
    category: 'DNS/Email',
    ssc_factor: 'dns_health',
    severity: 'info',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'dns_record',
    source_config_targets: ['dns_provider', '_dmarc_txt_record'],
    why: '서브도메인 DMARC 정책이 none이면 서브도메인 발신 위조를 처리하지 못합니다. 상위 sp= 또는 서브도메인 정책 상향 필요.',
    whereToChange: ['DNS provider', '상위 도메인 sp= 또는 서브도메인 _dmarc 상향'],
    configDiff: D('DNS TXT Record', 'zone file', [
      { t: 'del', s: 'TXT _dmarc.sub : "v=DMARC1; p=none"' },
      { t: 'add', s: 'TXT _dmarc.sub : "v=DMARC1; p=quarantine; ..."' }
    ]),
    verification: ['dig +short TXT _dmarc.sub.{host}']
  },
  {
    key: 'dkim_insufficient_key_length',
    display_name: 'Insufficient DKIM Key Length',
    category: 'DNS/Email',
    ssc_factor: 'dns_health',
    severity: 'info',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'dns_record',
    source_config_targets: ['dns_provider', 'mail_provider_dkim', 'dkim_txt_record'],
    why: 'DKIM 공개키가 짧으면(예: 512/768비트) 키 위조·서명 우회가 현실화됩니다. RSA 2048비트 권장.',
    whereToChange: ['메일 제공자 DKIM 키 재발급(2048비트)', 'selector._domainkey TXT 갱신'],
    configDiff: D('DNS TXT Record', 'zone file', [
      { t: 'del', s: 'TXT sel._domainkey : "v=DKIM1; k=rsa; p=<512-bit key>"' },
      { t: 'add', s: 'TXT sel._domainkey : "v=DKIM1; k=rsa; p=<2048-bit key>"' }
    ]),
    verification: ['dig +short TXT sel._domainkey.{host}  (키 길이 확인)']
  },
  {
    key: 'dkim_weak_signature',
    display_name: 'DKIM Record Using Non-Secure Public Key Algorithm',
    category: 'DNS/Email',
    ssc_factor: 'dns_health',
    severity: 'info',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'dns_record',
    source_config_targets: ['dns_provider', 'mail_provider_dkim', 'dkim_txt_record'],
    why: '약한 DKIM 공개키(짧은 키 등)는 서명 강도가 낮아 위조 위험이 있습니다. 권장 강도로 재발급 필요.',
    whereToChange: ['메일 제공자 DKIM 키 재발급(RSA 2048)', 'selector._domainkey TXT 갱신'],
    configDiff: D('DNS TXT Record', 'zone file', [
      { t: 'del', s: 'TXT sel._domainkey : "... p=<weak/short key>"' },
      { t: 'add', s: 'TXT sel._domainkey : "... p=<strong 2048-bit key>"' }
    ]),
    verification: ['dig +short TXT sel._domainkey.{host}']
  },

  // ── Network Service ──────────────────────────────────────────────
  {
    key: 'service_pptp',
    display_name: 'PPTP Service Accessible',
    category: 'Network Service',
    ssc_factor: 'network_security',
    severity: 'medium',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'network_control',
    source_config_targets: ['firewall', 'cloud_security_group', 'service_disable'],
    why: 'PPTP(1723)는 노후·취약 VPN 프로토콜입니다. 비활성화하고 안전한 VPN으로 이전하세요.',
    whereToChange: ['방화벽 / 보안그룹에서 1723 차단', 'PPTP 서비스 비활성화', '대체 VPN 적용'],
    configDiff: D('port state', 'firewall / security group', [
      { t: 'del', s: '1723/tcp open  pptp' },
      { t: 'add', s: '1723/tcp filtered' }
    ]),
    verification: ['nmap -p 1723 {host}', 'nc -vz {host} 1723']
  },
  {
    key: 'open_port',
    display_name: 'Open Port',
    category: 'Network Service',
    ssc_factor: 'network_security',
    severity: 'medium',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'network_control',
    source_config_targets: ['firewall', 'cloud_security_group', 'network_acl'],
    why: '불필요하게 노출된 포트는 공격 표면을 넓힙니다. 최소권한으로 차단하세요.',
    whereToChange: ['방화벽 / 보안그룹 / 네트워크 ACL', '불필요 서비스 비활성화'],
    configDiff: D('port state', 'firewall / security group', [
      { t: 'del', s: '{port}/tcp open' },
      { t: 'add', s: '{port}/tcp filtered' }
    ]),
    verification: ['nmap -p {port} {host}', 'nc -vz {host} {port}']
  },
  {
    key: 'insecure_telnet',
    display_name: 'Insecure Telnet',
    category: 'Network Service',
    ssc_factor: 'network_security',
    severity: 'high',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'network_control',
    source_config_targets: ['firewall', 'service_disable'],
    why: 'Telnet(23)은 평문 전송으로 자격증명 노출 위험이 큽니다. SSH로 대체하고 차단하세요.',
    whereToChange: ['telnet 서비스 비활성화', '방화벽에서 23 차단', 'SSH로 대체'],
    configDiff: D('port state', 'firewall / service', [
      { t: 'del', s: '23/tcp open  telnet' },
      { t: 'add', s: '23/tcp filtered' }
    ]),
    verification: ['nmap -p 23 {host}']
  },
  {
    key: 'insecure_ftp',
    display_name: 'Insecure FTP',
    category: 'Network Service',
    ssc_factor: 'network_security',
    severity: 'medium',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'network_control',
    source_config_targets: ['firewall', 'service_disable'],
    why: '평문 FTP(21)는 자격증명/데이터 노출 위험이 있습니다. SFTP/FTPS로 대체하세요.',
    whereToChange: ['FTP 서비스 비활성화 또는 FTPS/SFTP 전환', '방화벽에서 21 차단'],
    configDiff: D('port state', 'firewall / service', [
      { t: 'del', s: '21/tcp open  ftp' },
      { t: 'add', s: '21/tcp filtered' }
    ]),
    verification: ['nmap -p 21 {host}']
  },
  {
    key: 'service_rdp',
    display_name: 'Service RDP Exposed',
    category: 'Network Service',
    ssc_factor: 'network_security',
    severity: 'high',
    collector_type: 'scan_report',
    evidence_mode: 'before_after_scan_and_source',
    remediation_mode: 'network_control',
    source_config_targets: ['firewall', 'cloud_security_group', 'vpn_gateway'],
    why: 'RDP(3389)의 인터넷 직접 노출은 무차별 대입/취약점 공격 위험이 큽니다. VPN 뒤로 두거나 제한하세요.',
    whereToChange: ['방화벽 / 보안그룹에서 3389 제한', 'VPN/게이트웨이 뒤로 이동'],
    configDiff: D('port state', 'firewall / security group', [
      { t: 'del', s: '3389/tcp open  ms-wbt-server' },
      { t: 'add', s: '3389/tcp filtered' }
    ]),
    verification: ['nmap -p 3389 {host}']
  },
  // ── 노출 서비스(데이터 주도 생성 — DB/디렉터리/파일공유 등) ──────────
  ...NET_SVC_ENTRIES
]

// 별칭(같은 템플릿을 공유하는 변형 key) → 대표 key
const ALIASES = {
  hsts_incorrect_v2: 'hsts_incorrect',
  hsts_preloaded_incorrect: 'hsts_incorrect',
  csp_no_policy_v2: 'csp_no_policy',
  content_security_policy_missing: 'csp_no_policy',
  csp_unsafe_policy_v2: 'csp_unsafe_policy',
  csp_too_broad_v2: 'csp_too_broad',
  insecure_https_redirect_pattern_v2: 'insecure_https_redirect_pattern',
  spf_record_softfail: 'spf_record_missing',
  spf_record_wildcard: 'spf_record_missing',
  tlscert_expired: 'tlscert_excessive_expiration',
  tlscert_no_revocation: 'tlscert_excessive_expiration',
  insecure_server_certificate_key_size: 'tls_weak_cipher',
  service_vnc: 'service_rdp',
  service_dns: 'open_port',
  service_smtp: 'open_port'
}

// 비전문가용 한글 이름 (issue_type_key → 쉬운 한국어 명칭)
const KO_ISSUE_NAMES = {
  hsts_incorrect: 'HTTPS 강제(HSTS) 설정 미흡',
  cookie_missing_http_only: '쿠키 보호 옵션(HttpOnly) 누락',
  cookie_missing_secure_attribute: '쿠키 보호 옵션(Secure) 누락',
  csp_no_policy: '콘텐츠 보안 정책(CSP) 미설정',
  csp_unsafe_policy: "CSP에 'unsafe-*' 지시자 포함",
  csp_too_broad: 'CSP 광범위 지시자 포함',
  x_content_type_options_incorrect_v2: 'MIME 스니핑 방지 헤더 미적용',
  x_frame_options_incorrect_v2: '클릭재킹 방지 헤더 미적용',
  x_xss_protection_incorrect_v2: 'X-XSS-Protection 헤더 미적용',
  x_powered_by_present: '서버 기술 정보 노출',
  server_version_exposed: '서버 버전 노출',
  tls_weak_protocol: '오래된 암호화 통신(TLS) 허용',
  tls_weak_cipher: '취약한 암호화 방식 허용',
  tlscert_expired: '만료된 인증서',
  tlscert_no_revocation: '인증서 폐기정보(OCSP/CRL) 없음',
  tlscert_excessive_expiration: '인증서 유효기간 과다',
  tlscert_self_signed: '자체서명 인증서 사용',
  tlscert_weak_signature: '약한 알고리즘 서명 인증서',
  tlscert_revoked: '폐지된 인증서 사용',
  ssh_weak_cipher: 'SSH 취약 암호화 허용',
  ssh_weak_protocol: 'SSH 취약 프로토콜/키교환 허용',
  spf_record_missing: '메일 위조 방어(SPF) 미설정',
  dmarc_record_missing: '메일 위조 방어(DMARC) 미설정',
  dkim_record_missing: '메일 서명(DKIM) 미설정',
  spf_record_malformed: 'SPF 레코드 구문 오류',
  dmarc_contains_none: 'DMARC 정책이 none(미처리)',
  subdomain_dmarc_contains_none: '서브도메인 DMARC 정책 none',
  dkim_insufficient_key_length: 'DKIM 키 길이 부족',
  dkim_weak_signature: 'DKIM 약한 키/서명',
  service_pptp: '오래된 VPN(PPTP) 노출',
  open_port: '불필요한 포트 개방',
  insecure_telnet: '평문 원격접속(Telnet) 노출',
  insecure_ftp: '평문 파일전송(FTP) 노출',
  service_rdp: '원격 데스크톱(RDP) 인터넷 노출',
  ...NET_SVC_KO, // 노출 서비스 13종(데이터 주도)
  // 검증랩(Sandbox) 미지원이지만 표준 조치가 명확한 항목 — 한글 명칭 제공
  unsafe_sri: '외부 리소스 무결성(SRI) 미적용',
  x_content_type_options_incorrect: 'MIME 스니핑 방지 헤더(X-Content-Type-Options) 미흡',
  domain_missing_https: 'HTTPS 미적용(평문 HTTP)',
  insecure_https_redirect_pattern: '안전하지 않은 HTTPS 리다이렉트'
}

// SSC 10대 리스크(팩터) → 한글 명칭. Threat Indicators 카드와 동일한 10개 축.
export const KO_FACTOR = {
  network_security: '네트워크 보안',
  dns_health: 'DNS 상태',
  patching_cadence: '패치 관리',
  endpoint_security: '엔드포인트 보안',
  ip_reputation: 'IP 평판',
  application_security: '애플리케이션 보안',
  cubit_score: '구성 위험(Cubit)',
  hacker_chatter: '해커 활동 징후',
  leaked_information: '정보 유출',
  information_leak: '정보 유출', // 별칭(일부 응답)
  social_engineering: '사회공학 노출'
}

// 이슈 유형별 한글 조치 권고 요약 (비전문가용). 대표 key 기준, 별칭/버전(_vN)은 정규화 후 조회.
const KO_REMEDIATION = {
  hsts_incorrect: '웹서버·리버스프록시 응답에 Strict-Transport-Security(HSTS) 헤더를 추가해 HTTPS 접속을 강제하세요. 예: max-age=31536000; includeSubDomains.',
  cookie_missing_http_only: '세션 쿠키에 HttpOnly 속성을 추가해 스크립트(XSS)로부터 쿠키 접근을 차단하세요.',
  cookie_missing_secure_attribute: '세션 쿠키에 Secure 속성을 추가해 HTTPS 채널로만 쿠키가 전송되도록 하세요.',
  csp_no_policy: 'Content-Security-Policy 헤더를 도입하세요. Report-Only로 먼저 관측한 뒤 단계적으로 강화하는 것을 권장합니다.',
  x_powered_by_present: "불필요한 X-Powered-By 등 기술 스택 노출 헤더를 제거하세요(nginx proxy_hide_header, Express app.disable('x-powered-by')).",
  server_version_exposed: 'Server 헤더의 상세 버전 노출을 끄세요(nginx server_tokens off, Apache ServerTokens Prod).',
  tls_weak_protocol: 'TLS 1.0/1.1을 비활성화하고 TLS 1.2/1.3만 허용하세요.',
  tls_weak_cipher: '취약 cipher suite를 제거하고 권장 스위트(ECDHE-GCM 계열)만 허용하세요.',
  tlscert_excessive_expiration: '유효기간이 과도한 인증서는 단기 인증서+자동 갱신(ACME)으로 전환하세요.',
  spf_record_missing: 'SPF TXT 레코드를 추가해 발신 도메인 스푸핑을 방어하세요(DMARC와 병행 권장).',
  dmarc_record_missing: '_dmarc TXT 레코드를 추가해 SPF/DKIM 실패 처리 정책을 지정하세요.',
  dkim_record_missing: '메일 제공자에서 DKIM 키를 발급하고 selector._domainkey TXT 레코드를 등록하세요.',
  service_pptp: '노후 VPN인 PPTP(1723)를 비활성화하고 방화벽에서 차단, 안전한 VPN으로 이전하세요.',
  open_port: '불필요하게 노출된 포트를 방화벽·보안그룹에서 최소권한으로 차단하세요.',
  insecure_telnet: '평문 Telnet(23)을 비활성화하고 SSH로 대체, 방화벽에서 23을 차단하세요.',
  insecure_ftp: '평문 FTP(21)를 SFTP/FTPS로 전환하고 방화벽에서 21을 차단하세요.',
  service_rdp: 'RDP(3389)의 인터넷 직접 노출을 제한하고 VPN/게이트웨이 뒤로 이동하세요.',
  unsafe_sri: '외부에서 불러오는 스크립트·스타일에 무결성 해시(Subresource Integrity, integrity 속성)를 지정하고, 리소스 변경 시 해시를 함께 갱신하세요.',
  x_content_type_options_incorrect: '응답 헤더에 X-Content-Type-Options: nosniff 를 추가해 브라우저의 MIME 스니핑을 차단하세요.',
  domain_missing_https: '유효한 TLS 인증서를 적용하고 모든 HTTP 요청을 HTTPS로 리다이렉트하도록 웹서버를 구성하세요.',
  insecure_https_redirect_pattern: 'HTTP→HTTPS 리다이렉트의 최종 목적지가 HTTPS인지, 오픈 리다이렉트가 없는지 점검하고 안전한 301 리다이렉트로 통일하세요.'
}

// 심각도/수집방식/증적형태 한글 풀이
export const KO_SEVERITY = { high: '높음', medium: '보통', low: '낮음' }
export const KO_COLLECTOR = { web_screenshot: '웹 화면 캡처', scan_report: '스캔 리포트' }
export const KO_EVIDENCE_MODE = {
  before_after_header_and_source: '조치 전후 헤더·설정 비교',
  before_after_scan_and_source: '조치 전후 스캔·설정 비교'
}

// issue_type → 대표 key 정규화(별칭 + 버전 접미사 _vN 제거). 명칭/권고 조회 공용.
function repKey(issueTypeKey) {
  const k = String(issueTypeKey || '').toLowerCase()
  const base = k.replace(/_v\d+$/, '')
  return ALIASES[k] || ALIASES[base] || base
}
// issue_type → canonical(별칭·버전 병합) key. 드롭다운/목록 중복 제거용.
export const canonicalIssueKey = (issueTypeKey) => repKey(issueTypeKey)

// issue_type → 한글 명칭(별칭·버전 해석 포함). 없으면 display_name/원본 key로 폴백.
export function catalogNameKo(issueTypeKey) {
  const rep = repKey(issueTypeKey)
  return KO_ISSUE_NAMES[rep] || BY_KEY[rep]?.display_name || issueTypeKey
}

// SSC 팩터 원값 → 한글 10대 리스크 명칭. 없으면 원값/— 폴백.
export function factorNameKo(factor) {
  const k = String(factor || '').toLowerCase()
  return KO_FACTOR[k] || factor || '—'
}

// issue_type → 한글 조치 권고 요약. 매핑 없으면 null(호출부에서 폴백 처리).
export function remediationKo(issueTypeKey) {
  return KO_REMEDIATION[repKey(issueTypeKey)] || null
}

// factor(10대 리스크) 단위 일반 조치 방향. 개별 issue 권고가 없을 때의 폴백.
// 특히 웹/DNS 설정으로 재현 불가한 영역(패치·엔드포인트·평판·유출 등)의 대응 방향.
const KO_FACTOR_REMEDIATION = {
  application_security: '웹 애플리케이션·응답 헤더·인증서 설정을 표준에 맞게 교정하세요(HSTS·CSP·쿠키 속성·SRI 등).',
  network_security: '노출된 포트·취약 프로토콜(TLS/서비스)을 방화벽·보안그룹으로 최소화하고 안전한 설정만 허용하세요.',
  dns_health: 'SPF·DKIM·DMARC 등 메일/DNS 레코드를 정비해 도메인 위·변조 방어를 강화하세요.',
  patching_cadence: '자산 인벤토리와 취약점 스캐너로 노후 OS·소프트웨어를 식별하고 패치 SLA를 수립·자동화하세요. (개별 URL 조치가 아니라 패치 운영 프로세스 개선)',
  endpoint_security: 'EDR/백신을 배포하고, 외부에서 관측된 악성 활동의 근원 단말을 격리·치료하세요. (엔드포인트 운영 대응)',
  ip_reputation: '조직 IP에서 관측된 악성/봇넷 트래픽의 감염 호스트를 격리·정리하고, 필요 시 블랙리스트 해제를 요청하세요.',
  cubit_score: '외부에 노출된 관리자·로그인 페이지 등 민감 서비스의 접근을 IP 제한·VPN·인증 강화로 축소하세요.',
  hacker_chatter: '다크웹/포럼 위협 인텔리전스를 모니터링하고, 언급된 자산·계정을 선제적으로 점검·강화하세요.',
  leaked_information: '유출된 자격증명을 즉시 무효화(비밀번호 재설정·MFA)하고 지속적인 유출 모니터링 체계를 운영하세요.',
  information_leak: '유출된 자격증명을 즉시 무효화(비밀번호 재설정·MFA)하고 지속적인 유출 모니터링 체계를 운영하세요.',
  social_engineering: '임직원 대상 피싱 훈련·보안 인식 교육을 정기화하고, 외부에 노출된 임직원 정보를 최소화하세요.'
}
export function factorRemediationKo(factor) {
  const k = String(factor || '').toLowerCase()
  return KO_FACTOR_REMEDIATION[k] || null
}

const BY_KEY = Object.fromEntries(SANDBOX_CATALOG.map((e) => [e.key, e]))

export function catalogEntry(issueTypeKey) {
  const k = String(issueTypeKey || '').toLowerCase()
  return BY_KEY[k] || (ALIASES[k] ? { ...BY_KEY[ALIASES[k]], key: k, aliasOf: ALIASES[k] } : null)
}

// 드롭다운용 카테고리 그룹 (Sandbox 지원 subset만)
export function catalogGroups() {
  const groups = {}
  for (const e of SANDBOX_CATALOG) (groups[e.category] = groups[e.category] || []).push({ key: e.key, display_name: e.display_name })
  return Object.entries(groups).map(([category, items]) => ({ category, items }))
}

export const SANDBOX_SUPPORTED_KEYS = SANDBOX_CATALOG.map((e) => e.key)
