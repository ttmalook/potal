// =====================================================================
// Engine-specific Remediation Guides — 고객 엔진에 맞는 조치 스니펫
//  핵심 설계: 대부분의 조치는 "범용 목표값 × 엔진 출력 템플릿"으로 분해된다.
//   - 이슈 → 목표 상태(헤더/쿠키/TLS)  (엔진 무관)
//   - 엔진 → 그 목표를 내보내는 문법     (엔진별)
//   → 조합으로 엔진별 스니펫 생성. (이슈마다 엔진별로 따로 안 씀)
//  SSC는 웹 엔진을 신뢰성 있게 주지 않음(실측 확인) → 탭 수동선택이 기본,
//   product_name 감지 시 보조 힌트로만 사용.
//  DNS/네트워크/인증서 유효기간 등은 엔진 무관 → applies:false (탭 없음).
// =====================================================================

// 지원 엔진(계층). 헤더/TLS 조치가 적용될 수 있는 지점.
export const ENGINES = [
  { id: 'nginx', label: 'NGINX', file: 'nginx.conf / conf.d/*.conf' },
  { id: 'apache', label: 'Apache', file: 'httpd.conf / .htaccess (mod_headers)' },
  { id: 'iis', label: 'IIS', file: 'web.config' },
  { id: 'app', label: '애플리케이션', file: '프레임워크 미들웨어' }
]

// issue_type → 조치 형태(shape) + 목표값
function shapeFor(issueType) {
  const t = String(issueType || '').toLowerCase()
  if (t.includes('ssh')) return null // SSH는 sshd_config 하나 — 웹 엔진(nginx/apache/iis) 탭 부적합. 소스 diff로 충분.
  if (t.includes('hsts')) return { kind: 'header', name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
  if (t.includes('csp') || t.includes('content_security')) return { kind: 'header', name: 'Content-Security-Policy', value: "default-src 'self'" }
  if (t.includes('x_frame') || t.includes('clickjack')) return { kind: 'header', name: 'X-Frame-Options', value: 'SAMEORIGIN' }
  if (t.includes('x_content') || t.includes('content_type_options')) return { kind: 'header', name: 'X-Content-Type-Options', value: 'nosniff' }
  if (t.includes('referrer')) return { kind: 'header', name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
  if (t.includes('cookie') && t.includes('http_only')) return { kind: 'cookie', attrs: ['HttpOnly'] }
  if (t.includes('cookie') && t.includes('secure')) return { kind: 'cookie', attrs: ['Secure'] }
  if (t.includes('protocol')) return { kind: 'tls_protocol' }
  if (t.includes('cipher')) return { kind: 'tls_cipher' }
  // HTTPS 강제(평문 HTTP 미적용 / HTTP→HTTPS 리다이렉트) — 엔진별 리다이렉트 설정이 다름 → 탭 대상
  if (t.includes('domain_missing_https') || t.includes('insecure_https_redirect') || (t.includes('https') && t.includes('redirect'))) return { kind: 'https_redirect' }
  return null // 엔진 무관 (dns/network/cert-expiration 등)
}

// 엔진별 스니펫 렌더
function renderSnippet(engineId, shape) {
  if (shape.kind === 'header') {
    const { name, value } = shape
    switch (engineId) {
      case 'nginx': return `add_header ${name} "${value}" always;`
      case 'apache': return `# mod_headers 필요\nHeader always set ${name} "${value}"`
      case 'iis': return `<!-- web.config -->\n<system.webServer>\n  <httpProtocol>\n    <customHeaders>\n      <add name="${name}" value="${value}" />\n    </customHeaders>\n  </httpProtocol>\n</system.webServer>`
      case 'app': return `// Express 예시 (프레임워크마다 다름)\napp.use((req, res, next) => {\n  res.setHeader('${name}', '${value}')\n  next()\n})`
    }
  }
  if (shape.kind === 'cookie') {
    const flags = shape.attrs
    const lower = flags.map((f) => f.toLowerCase()).join(' ')
    switch (engineId) {
      case 'nginx': return `# 앱이 내려주는 Set-Cookie에 속성 보강 (nginx 1.19.3+)\nproxy_cookie_flags ~ ${lower};`
      case 'apache': return `# mod_headers — 응답 Set-Cookie에 속성 추가\nHeader always edit Set-Cookie ^(.*)$ "$1; ${flags.join('; ')}"`
      case 'iis': return `<!-- web.config -->\n<system.web>\n  <httpCookies httpOnlyCookies="true" requireSSL="true" />\n</system.web>`
      case 'app': return `// 애플리케이션 세션 쿠키 옵션 (권장: 코드에서 직접)\nres.cookie('SID', value, { ${flags.map((f) => (f === 'HttpOnly' ? 'httpOnly: true' : f === 'Secure' ? 'secure: true' : '')).filter(Boolean).join(', ')}, sameSite: 'strict' })`
    }
  }
  if (shape.kind === 'tls_protocol') {
    switch (engineId) {
      case 'nginx': return `ssl_protocols TLSv1.2 TLSv1.3;   # TLS 1.0/1.1 제거`
      case 'apache': return `SSLProtocol -all +TLSv1.2 +TLSv1.3`
      case 'iis': return `# Windows Schannel 레지스트리에서 TLS 1.0/1.1 비활성화\n# HKLM\\SYSTEM\\...\\SCHANNEL\\Protocols\\TLS 1.0\\Server: Enabled=0`
      case 'app': return `// 리버스 프록시/LB에서 TLS 종단 시 그쪽 설정. 앱 직접 종단이면 런타임 TLS 옵션.`
    }
  }
  if (shape.kind === 'tls_cipher') {
    switch (engineId) {
      case 'nginx': return `ssl_ciphers HIGH:!aNULL:!MD5:!3DES;\nssl_prefer_server_ciphers on;`
      case 'apache': return `SSLCipherSuite HIGH:!aNULL:!MD5:!3DES\nSSLHonorCipherOrder on`
      case 'iis': return `# Windows Schannel Cipher Suite 순서 정책(그룹 정책/레지스트리)에서\n# 취약 스위트(3DES/RC4 등) 제거`
      case 'app': return `// TLS 종단 지점(프록시/LB/런타임)의 cipher 정책에서 취약 스위트 제거`
    }
  }
  if (shape.kind === 'https_redirect') {
    switch (engineId) {
      case 'nginx': return `# 80(HTTP) → 443(HTTPS) 301 강제 (인증서는 별도 발급·적용)\nserver {\n  listen 80;\n  server_name example.com;\n  return 301 https://$host$request_uri;\n}`
      case 'apache': return `# mod_rewrite — HTTP 요청을 HTTPS로 301\nRewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]`
      case 'iis': return `<!-- web.config · URL Rewrite 모듈 필요 -->\n<rewrite>\n  <rules>\n    <rule name="HTTPS Redirect" stopProcessing="true">\n      <match url="(.*)" />\n      <conditions>\n        <add input="{HTTPS}" pattern="off" />\n      </conditions>\n      <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />\n    </rule>\n  </rules>\n</rewrite>`
      case 'app': return `// 리버스 프록시/LB에서 HTTPS 종단·리다이렉트가 원칙.\n// 앱 직접 처리 시 (Express 예시):\napp.use((req, res, next) => {\n  if (req.headers['x-forwarded-proto'] === 'http') {\n    return res.redirect(301, 'https://' + req.headers.host + req.url)\n  }\n  next()\n})`
    }
  }
  return ''
}

const LANG = { nginx: 'nginx', apache: 'apache', iis: 'xml', app: 'js' }

// 버전 주의(있을 때만)
function versionNote(shape) {
  if (shape.kind === 'header') return null // add_header/Header set/web.config 는 버전 안정적
  if (shape.kind === 'cookie') return 'nginx proxy_cookie_flags 는 1.19.3+ 필요. 가능하면 애플리케이션 코드에서 직접 설정 권장.'
  if (shape.kind === 'tls_protocol') return 'TLS 1.3 은 nginx 1.13+ / OpenSSL 1.1.1+ 필요.'
  if (shape.kind === 'tls_cipher') return '권장 스위트는 서버 OpenSSL 버전에 따라 다를 수 있음. 변경 후 재스캔 확인.'
  if (shape.kind === 'https_redirect') return '리다이렉트 전 유효한 TLS 인증서가 443에 적용돼 있어야 함(예: Let\'s Encrypt). 리다이렉트 후 HSTS 헤더 추가 권장.'
  return null
}

// 메인: issue_type → 엔진별 조치 가이드 (또는 applies:false)
export function engineGuide(issueType) {
  const shape = shapeFor(issueType)
  if (!shape) return { applies: false }
  return {
    applies: true,
    kind: shape.kind,
    target: shape.kind === 'header' ? { header: shape.name, value: shape.value } : null,
    versionNote: versionNote(shape),
    engines: ENGINES.map((e) => ({ ...e, lang: LANG[e.id], snippet: renderSnippet(e.id, shape) }))
  }
}

// SSC product_name(감지 제품, 있을 때만) → 엔진 탭 힌트. 없으면 null(수동선택).
export function engineHintFrom(productName) {
  const p = String(productName || '').toLowerCase()
  if (/nginx|openresty/.test(p)) return 'nginx'
  if (/apache|httpd/.test(p)) return 'apache'
  if (/iis|microsoft-iis/.test(p)) return 'iis'
  if (/express|node|tomcat|jetty|spring|django|flask|rails/.test(p)) return 'app'
  return null
}
