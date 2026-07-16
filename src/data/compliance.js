// =====================================================================
// 컴플라이언스 매핑 (Phase 2) — 조치 가이드 유형별 "관련 프레임워크"
//  - (B) 유형 분류(category) → 통제영역 기반 관련 프레임워크
//  - (A) 산업군 버킷 → 적용 프레임워크
//  - 화면: 표 = (B) 태그 / 드로어 = (A)∩(B) 산업군별 매트릭스
// ⚠️ "관련성" 수준입니다. 정확한 조항·의무 여부는 고객사 규모·업태·카드취급 여부에
//    따라 달라지므로 실제 감사·제안용은 표준 원문 대조가 필요합니다.
// =====================================================================

// (B) 유형 분류 → 관련 프레임워크 (통제영역 기반)
export const FRAMEWORKS_BY_CATEGORY = {
  'HTTP/Web Header': ['ISMS-P', 'OWASP ASVS', 'ISO 27001', 'PCI-DSS'],
  'TLS/Certificate': ['PCI-DSS', 'ISMS-P', 'ISO 27001', '전자금융'],
  'DNS/Email': ['ISMS-P', '금융보안원'],
  'Network Service': ['ISMS-P', 'PCI-DSS', 'ISO 27001']
}

// (A) 산업군 버킷 → 적용 프레임워크
export const FRAMEWORKS_BY_INDUSTRY = {
  '금융·보험': ['ISMS-P', '전자금융', '금융보안원', 'PCI-DSS', 'ISO 27001', '개인정보보호법'],
  '전자·제조': ['ISMS-P', 'ISO 27001', '개인정보보호법'],
  'IT·서비스': ['ISMS-P', 'ISO 27001', 'OWASP ASVS', '개인정보보호법'],
  '일반': ['ISMS-P', '개인정보보호법']
}

export const INDUSTRY_BUCKETS = Object.keys(FRAMEWORKS_BY_INDUSTRY)

// 고객사 산업군 문자열 → 버킷 정규화 (Phase 2b 고객 맥락에서 사용)
const INDUSTRY_ALIASES = [
  [/금융|보험|은행|카드|증권/, '금융·보험'],
  [/전자|제조|반도체|화학|중공업/, '전자·제조'],
  [/it|서비스|소프트웨어|플랫폼|커머스|테크/i, 'IT·서비스']
]
export function industryBucket(raw) {
  const s = String(raw || '')
  for (const [re, bucket] of INDUSTRY_ALIASES) if (re.test(s)) return bucket
  return '일반'
}

// (B) 카테고리 → 관련 프레임워크 (전 산업 공통 관점, 표 태그용)
export function frameworksForCategory(category) {
  return FRAMEWORKS_BY_CATEGORY[category] || ['ISMS-P']
}

// (A)∩(B): 카테고리 × 산업군 → 해당 유형이 그 산업에서 걸리는 프레임워크
export function complianceByIndustry(category) {
  const b = new Set(frameworksForCategory(category))
  return INDUSTRY_BUCKETS.map((industry) => ({
    industry,
    frameworks: FRAMEWORKS_BY_INDUSTRY[industry].filter((f) => b.has(f))
  }))
}

// =====================================================================
// L1 매핑 — 취약점 → 통제 영역 + 프레임워크(예시 조항). "관련성 참고" 수준.
//  ⚠️ 통제 영역은 방어 가능하나, 조항 번호는 '예시'이며 감사 판정이 아닙니다.
//     실제 적용·조항은 고객 인증 범위 + 프레임워크 원문 대조로 확정해야 합니다.
//     조항 표기는 버전(예: PCI-DSS 3.2.1↔4.0, ISO 27001:2013↔2022)에 따라 다를 수 있어
//     아래 값은 컴플라이언스 담당자가 검토·수정하는 것을 전제로 한 초안입니다.
//  · 기본: 카테고리 단위. 의미가 다른 유형만 OVERRIDE 로 세분화.
// =====================================================================

// (C) 카테고리 → { areas: 통제영역[], frameworks: [{ name, clause(예시) }] }
export const CONTROL_BY_CATEGORY = {
  'HTTP/Web Header': {
    areas: ['웹 서비스 보안 설정', '통신 보안'],
    frameworks: [
      { name: 'ISMS-P', clause: '2.10 시스템·서비스 보안관리' },
      { name: 'OWASP ASVS', clause: 'V14 구성(보안 헤더)' },
      { name: 'ISO 27001', clause: 'A.8.9 구성 관리' },
      { name: 'PCI-DSS', clause: 'Req.6 보안 구성·개발' }
    ]
  },
  'TLS/Certificate': {
    areas: ['암호화(전송 구간)', '키·인증서 관리'],
    frameworks: [
      { name: 'PCI-DSS', clause: 'Req.4 전송 중 강력한 암호화' },
      { name: 'ISMS-P', clause: '2.7 암호화 적용' },
      { name: 'ISO 27001', clause: 'A.8.24 암호화 사용' },
      { name: '전자금융', clause: '전자금융감독규정 암호화' }
    ]
  },
  'DNS/Email': {
    areas: ['이메일 위·변조 방지'],
    frameworks: [
      { name: 'ISMS-P', clause: '2.10 시스템·서비스 보안관리(메일)' },
      { name: '금융보안원', clause: '이메일 보안 권고' }
    ]
  },
  'Network Service': {
    areas: ['접근 통제', '네트워크 노출 관리'],
    frameworks: [
      { name: 'ISMS-P', clause: '2.6 접근통제' },
      { name: 'PCI-DSS', clause: 'Req.1 네트워크 보안 통제' },
      { name: 'ISO 27001', clause: 'A.8.20 네트워크 보안' }
    ]
  }
}

// (O) issue_type OVERRIDE — 카테고리 기본과 통제 영역이 다른 유형만.
export const CONTROL_OVERRIDE = {
  cookie_missing_http_only: { areas: ['세션·쿠키 보호'], frameworks: [{ name: 'ISMS-P', clause: '2.6 접근통제(세션)' }, { name: 'OWASP ASVS', clause: 'V3 세션 관리' }] },
  cookie_missing_secure_attribute: { areas: ['세션·쿠키 보호'], frameworks: [{ name: 'ISMS-P', clause: '2.6 접근통제(세션)' }, { name: 'OWASP ASVS', clause: 'V3 세션 관리' }] },
  hsts_incorrect: { areas: ['통신 암호화 강제'], frameworks: [{ name: 'ISMS-P', clause: '2.7 암호화 적용' }, { name: 'PCI-DSS', clause: 'Req.4 전송 중 암호화' }, { name: 'OWASP ASVS', clause: 'V9 통신' }] },
  insecure_https_redirect_pattern: { areas: ['통신 암호화 강제'], frameworks: [{ name: 'ISMS-P', clause: '2.7 암호화 적용' }, { name: 'OWASP ASVS', clause: 'V9 통신' }] },
  csp_no_policy: { areas: ['웹 취약점 방어(XSS)'], frameworks: [{ name: 'OWASP ASVS', clause: 'V5 검증·인코딩' }, { name: 'ISMS-P', clause: '2.10 시스템·서비스 보안관리' }] },
  csp_too_broad: { areas: ['웹 취약점 방어(XSS)'], frameworks: [{ name: 'OWASP ASVS', clause: 'V5 검증·인코딩' }, { name: 'ISMS-P', clause: '2.10 시스템·서비스 보안관리' }] },
  csp_unsafe_policy: { areas: ['웹 취약점 방어(XSS)'], frameworks: [{ name: 'OWASP ASVS', clause: 'V5 검증·인코딩' }, { name: 'ISMS-P', clause: '2.10 시스템·서비스 보안관리' }] }
}

// (W) 산업군 버킷 → '규제 강도 높은(특수)' 프레임워크만 — 우선순위 판별자(전달물).
//  ⚠️ ISMS-P 는 대부분 유형에 붙는 '보편 기준'이라 판별자에서 제외(넣으면 전부 우선이 됨).
//     특수 규제(전자금융/PCI-DSS/금융보안원/개인정보보호법)에 걸릴 때만 '우선 조치' 신호.
export const HIGH_WEIGHT_BY_INDUSTRY = {
  '금융·보험': ['전자금융', '금융보안원', 'PCI-DSS'],
  '전자·제조': ['개인정보보호법'],
  'IT·서비스': ['개인정보보호법'],
  '일반': []
}

const repIssue = (k) => String(k || '').toLowerCase().replace(/_v\d+$/, '')

// 취약점 → 통제영역+프레임워크(예시조항). override 우선, 없으면 카테고리 기본.
export function complianceRefFor(issueType, category) {
  const base = CONTROL_BY_CATEGORY[category] || { areas: ['정보보호 일반'], frameworks: [{ name: 'ISMS-P', clause: '2. 보호대책 요구사항' }] }
  const ov = CONTROL_OVERRIDE[repIssue(issueType)]
  return ov ? { areas: ov.areas, frameworks: ov.frameworks } : { areas: base.areas, frameworks: base.frameworks }
}

// 전달물용 — 고객 산업군으로 필터 + '규제 관련' 표시(우선순위 주장 아님).
//  regulated=true : 특수 규제(전자금융/PCI/금융보안원/개인정보보호법)에 걸림 → '규제 관련' 태그.
//  반환: { areas, frameworks:[{name,clause,regulated}], regulated:bool, bucket }
export function deliveryComplianceFor(issueType, category, industryRaw) {
  const ref = complianceRefFor(issueType, category)
  const bucket = industryBucket(industryRaw)
  const applicable = new Set(FRAMEWORKS_BY_INDUSTRY[bucket] || [])
  const special = new Set(HIGH_WEIGHT_BY_INDUSTRY[bucket] || [])
  const frameworks = ref.frameworks
    .filter((f) => applicable.has(f.name)) // 이 산업군에 적용되는 프레임워크만
    .map((f) => ({ ...f, regulated: special.has(f.name) }))
  return { areas: ref.areas, frameworks, regulated: frameworks.some((f) => f.regulated), bucket }
}
