// =====================================================================
// Lab Profile 라이브러리 — 기존 랩의 '구조 서술자'(읽기전용).
//  · classifier 의 정답지: 새 issue 를 이름이 아니라 '구현 구조 + 검증 의미'로 비교.
//  · 운영 코드(lab.js/collector/target)를 건드리지 않는 순수 메타데이터.
//  · autoBuildable=true : 제네릭 응답기+제네릭 collector 핸들러로 레시피만으로 재현 가능.
//    false : 검증 의미가 단순 존재/값이 아니라 전용 처리 필요(CSP 정책분석/쿠키속성/리다이렉트).
//  · Phase 1 은 http_header 만 서술. Phase 2 에서 tls/dns/network/ssh 확장.
// =====================================================================

export const LAB_PROFILES = [
  // 단순 헤더 존재/값 — 레시피 자동 빌드 가능(제네릭 응답기).
  { issueType: 'x_frame_options_incorrect_v2', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'header_absence', collectorCapability: 'http_response_headers', verificationSemantics: { kind: 'http_header_presence', header: 'X-Frame-Options', before: 'missing', after: 'SAMEORIGIN' }, autoBuildable: true },
  { issueType: 'x_content_type_options_incorrect_v2', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'header_absence', collectorCapability: 'http_response_headers', verificationSemantics: { kind: 'http_header_presence', header: 'X-Content-Type-Options', before: 'missing', after: 'nosniff' }, autoBuildable: true },
  { issueType: 'x_xss_protection_incorrect_v2', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'header_absence', collectorCapability: 'http_response_headers', verificationSemantics: { kind: 'http_header_presence', header: 'X-XSS-Protection', before: 'missing', after: '1; mode=block' }, autoBuildable: true },
  { issueType: 'hsts_incorrect_v2', archetype: 'http_header', protocol: 'https', targetEngine: 'nginx', mutationType: 'header_value', collectorCapability: 'http_response_headers', verificationSemantics: { kind: 'http_header_value', header: 'Strict-Transport-Security', before: 'missing', after: 'max-age=31536000; includeSubDomains' }, autoBuildable: true },

  // 검증 의미가 단순 존재검사가 아님 — 자동 재사용 금지(HSTS≠CSP 가드).
  { issueType: 'csp_no_policy_v2', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'header_absence', collectorCapability: 'browser_csp_demo', verificationSemantics: { kind: 'csp_policy', header: 'Content-Security-Policy', before: 'missing', after: "default-src 'self'" }, autoBuildable: false, note: '브라우저 인라인 스크립트 실행/차단 데모 — 헤더 존재만으로 판정 불가.' },
  { issueType: 'csp_too_broad_v2', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'header_value', collectorCapability: 'http_response_headers', verificationSemantics: { kind: 'csp_policy', header: 'Content-Security-Policy', before: 'default-src *', after: "default-src 'self'" }, autoBuildable: false, note: 'directive 광범위성 정책 분석.' },
  { issueType: 'csp_unsafe_policy_v2', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'header_value', collectorCapability: 'http_response_headers', verificationSemantics: { kind: 'csp_policy', header: 'Content-Security-Policy', before: "unsafe-inline", after: "'self'" }, autoBuildable: false, note: "unsafe-* directive 정책 분석." },
  { issueType: 'cookie_missing_http_only', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'cookie_attribute', collectorCapability: 'cookie_attributes', verificationSemantics: { kind: 'cookie_attr', header: 'Set-Cookie', before: 'HttpOnly 없음', after: 'HttpOnly' }, autoBuildable: false, note: 'Set-Cookie 속성 파싱 — 헤더 존재검사와 다름.' },
  { issueType: 'cookie_missing_secure_attribute', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'cookie_attribute', collectorCapability: 'cookie_attributes', verificationSemantics: { kind: 'cookie_attr', header: 'Set-Cookie', before: 'Secure 없음', after: 'Secure' }, autoBuildable: false, note: 'Set-Cookie 속성 파싱.' },
  { issueType: 'insecure_https_redirect_pattern_v2', archetype: 'http_header', protocol: 'http', targetEngine: 'nginx', mutationType: 'redirect', collectorCapability: 'http_redirect', verificationSemantics: { kind: 'redirect_pattern', header: 'Location', before: '302 http://', after: '301 https://' }, autoBuildable: false, note: '상태코드+Location 스킴 — 헤더 존재검사와 다름.' },

  // 네트워크 서비스 노출 — nmap open→closed. 레시피 port 만 바꾸면 자동 재현(baked 포트).
  { issueType: 'service_mysql', archetype: 'network', protocol: 'tcp', targetEngine: 'generic', mutationType: 'port_exposed', collectorCapability: 'port_scan', verificationSemantics: { kind: 'network_port_exposed', port: 3306, before: 'open', after: 'closed' }, autoBuildable: true },
  { issueType: 'service_rdp', archetype: 'network', protocol: 'tcp', targetEngine: 'generic', mutationType: 'port_exposed', collectorCapability: 'port_scan', verificationSemantics: { kind: 'network_port_exposed', port: 3389, before: 'open', after: 'closed' }, autoBuildable: true },
  { issueType: 'insecure_telnet', archetype: 'network', protocol: 'tcp', targetEngine: 'generic', mutationType: 'port_exposed', collectorCapability: 'port_scan', verificationSemantics: { kind: 'network_port_exposed', port: 23, before: 'open', after: 'closed' }, autoBuildable: true }
]

export function profilesByArchetype(archetype) {
  return LAB_PROFILES.filter((p) => p.archetype === archetype)
}
// 자동 빌드 가능한(제네릭 응답기) 헤더 패턴 예시 — Claude few-shot / classifier 근접 예시.
export function autoBuildableHeaderProfiles() {
  return LAB_PROFILES.filter((p) => p.archetype === 'http_header' && p.autoBuildable)
}
export function getProfile(issueType) {
  return LAB_PROFILES.find((p) => p.issueType === String(issueType || '').toLowerCase()) || null
}
