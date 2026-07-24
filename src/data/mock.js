// =====================================================================
// Developer fixture data only — 삭제하지 마세요.
//  - 사용자-facing UI에는 노출되지 않습니다(기본값). VITE_ENABLE_DEV_MOCKS=true일 때만
//    Developer Mock Samples / 수동 Mock 보기에서 사용됩니다.
//  - 용도: UI 회귀 테스트, API 미연결/offline 개발, 특정 상태값 테스트, 교육/데모 샘플.
//  - 실제 API/DB/Docker/AI 호출 없음. 정책: docs/SSC_DEV_MOCKS_POLICY.md
// =====================================================================

// 공통 고지 문구 (Evidence Pack / Customer View 하단 고정)
export const LEGAL_NOTICE =
  '본 자료는 SecurityScorecard에서 수집된 외부 관측 기반 Finding과 당사 표준 검증랩에서 수행한 일반 조치 방향의 ' +
  '참고용 PoC 증적을 함께 제공하는 자료입니다. ' +
  '당사 표준 검증랩 증적은 고객사 운영환경에서 해당 조치가 적용되었거나 해당 Finding이 해소되었음을 의미하지 않습니다. ' +
  '고객사 운영환경의 실제 조치 여부와 SecurityScorecard Finding 해소 여부는 고객사 내부 검토 및 SecurityScorecard ' +
  '플랫폼의 재스캔 또는 공식 검증 절차를 통해 확인해야 합니다. ' +
  '운영 환경 반영 전 고객사 보안 담당자, 서비스 운영 담당자 또는 관련 벤더의 검토가 필요합니다.'

// 파트너 랩 증적 성격 고지 (짧은 버전 — 각 증적 영역에 부착)
export const PARTNER_LAB_NOTICE =
  '본 증적은 당사 표준 검증랩에서 동일 유형의 리스크를 재현하고 일반 조치 방향을 시연한 참고용 PoC 결과입니다. ' +
  '고객사 운영환경에서 해당 Finding이 해소되었음을 의미하지 않으며, 실제 조치 여부는 SecurityScorecard 재스캔 또는 ' +
  '공식 검증 절차를 통해 확인해야 합니다.'

// SSC 재스캔 / 공식 검증 안내 (Evidence Pack F 섹션 / Customer View)
export const RESCAN_NOTICE =
  '고객사 운영환경에서 조치가 완료된 후에는 SecurityScorecard 플랫폼의 재스캔 또는 공식 remediation validation 절차를 ' +
  '통해 Finding 해소 여부를 확인해야 합니다. 파트너 표준 검증랩 증적은 고객 환경의 Finding 해소 여부를 대체하지 않습니다.'

// 발행 워크플로우 상태 (Risk Finding 상태 흐름) — SSC 재스캔/공식 검증 단계 포함
export const WORKFLOW_STATES = [
  'Customer Registered',
  'Domain Scope Registered',
  'SSC Risk Imported',
  'External Observation Added',
  'Advisory Drafted',
  'Partner Lab PoC Ready',
  'Evidence Pack Ready',
  'Delivered to Customer',
  'Customer Reviewing',
  'Customer Remediation In Progress',
  'SSC Re-scan Required',
  'SSC Re-scan Confirmed',
  'Closed by Customer'
]

// ---------------------------------------------------------------------
// KPI / Dashboard
//  - dashboardStats·workQueues·recentActivity(목업)는 제거됨.
//    대시보드는 실집계(고객·도메인·증적 팩) + 실제 감사 로그로 대체.
//    → src/pages/Pages.jsx Dashboard 참조.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------
export const customers = [
  {
    id: 'CUST-001',
    name: 'Acme Electronics',
    industry: '전자/제조',
    domains: 4,
    openRisks: 3,
    lastCheck: '2026-06-30',
    engineer: 'Jiwon Park',
    status: 'Active',
    contact: 'security@acme.example',
    note: '대표 도메인 및 포털/ API 서브도메인 점검 동의 완료.'
  },
  {
    id: 'CUST-002',
    name: 'Globex Insurance',
    industry: '금융/보험',
    domains: 3,
    openRisks: 4,
    lastCheck: '2026-06-29',
    engineer: 'Minseok Lee',
    status: 'Review',
    contact: 'infosec@globex.example',
    note: '금융권 변경관리 절차로 재관측 요청 진행 중.'
  },
  {
    id: 'CUST-003',
    name: 'Sample Manufacturing Co.',
    industry: '제조',
    domains: 3,
    openRisks: 2,
    lastCheck: '2026-06-28',
    engineer: 'Jiwon Park',
    status: 'Active',
    contact: 'it-ops@sample-mfg.example',
    note: '스크린샷 저장 허용, HAR 저장은 일부 도메인 제외.'
  },
  {
    id: 'CUST-004',
    name: 'Sample Finance Corp.',
    industry: '금융',
    domains: 2,
    openRisks: 1,
    lastCheck: '2026-06-25',
    engineer: 'Soyeon Kim',
    status: 'Suspended',
    contact: 'grc@sample-finance.example',
    note: '계약 갱신 검토로 점검 일시 보류.'
  }
]

// ---------------------------------------------------------------------
// Domains & Scope
// ---------------------------------------------------------------------
export const domains = [
  {
    id: 'DOM-001',
    customer: 'Acme Electronics',
    primary: 'www.example.co.kr',
    allow: ['https://www.example.co.kr/*', 'https://portal.example.co.kr/*'],
    deny: ['https://api.example.co.kr/internal/*'],
    screenshot: true,
    har: true,
    consent: '동의 완료',
    status: 'In Scope'
  },
  {
    id: 'DOM-002',
    customer: 'Acme Electronics',
    primary: 'portal.example.co.kr',
    allow: ['https://portal.example.co.kr/*'],
    deny: ['https://portal.example.co.kr/admin/*'],
    screenshot: true,
    har: false,
    consent: '동의 완료',
    status: 'In Scope'
  },
  {
    id: 'DOM-003',
    customer: 'Globex Insurance',
    primary: 'secure.sample-finance.com',
    allow: ['https://secure.sample-finance.com/*'],
    deny: ['https://secure.sample-finance.com/payment/*', 'https://secure.sample-finance.com/login/*'],
    screenshot: true,
    har: true,
    consent: '검토 중',
    status: 'Pending Consent'
  },
  {
    id: 'DOM-004',
    customer: 'Sample Manufacturing Co.',
    primary: 'api.example.co.kr',
    allow: ['https://api.example.co.kr/public/*'],
    deny: ['https://api.example.co.kr/v1/admin/*'],
    screenshot: false,
    har: false,
    consent: '동의 완료',
    status: 'Restricted'
  }
]

// ---------------------------------------------------------------------
// Risk Findings
// ---------------------------------------------------------------------
export const findings = [
  {
    id: 'RF-1001',
    source: 'SecurityScorecard API',
    risk: 'HSTS 미설정',
    customer: 'Acme Electronics',
    url: 'https://www.example.co.kr',
    observed: 'Strict-Transport-Security: Not Present',
    severity: 'High',
    difficulty: 'Low',
    evidence: 'Partner Lab PoC Ready',
    guide: 'Drafted',
    delivery: 'Delivered to Customer',
    state: 'Delivered to Customer'
  },
  {
    id: 'RF-1002',
    source: 'SecurityScorecard API',
    risk: 'CSP 미설정',
    customer: 'Globex Insurance',
    url: 'https://secure.sample-finance.com',
    observed: 'Content-Security-Policy: Not Present',
    severity: 'High',
    difficulty: 'Medium',
    evidence: 'Partner Lab PoC Ready',
    guide: 'Drafted',
    delivery: 'Not Delivered',
    state: 'Evidence Pack Ready'
  },
  {
    id: 'RF-1003',
    source: 'External Observation',
    risk: 'Cookie Secure / HttpOnly / SameSite 미흡',
    customer: 'Acme Electronics',
    url: 'https://portal.example.co.kr',
    observed: 'Set-Cookie: SID=...; (Secure/HttpOnly 미지정)',
    severity: 'Medium',
    difficulty: 'Low',
    evidence: 'Partner Lab Evidence Pending',
    guide: 'Drafted',
    delivery: 'Not Delivered',
    state: 'Partner Lab PoC Ready'
  },
  {
    id: 'RF-1004',
    source: 'External Observation',
    risk: 'Mixed Content',
    customer: 'Sample Manufacturing Co.',
    url: 'https://www.example.co.kr/catalog',
    observed: 'http:// 리소스 3건 로드 (img, script)',
    severity: 'Medium',
    difficulty: 'Medium',
    evidence: 'Partner Lab Evidence Pending',
    guide: 'Draft Needed',
    delivery: 'Not Delivered',
    state: 'SSC Risk Imported'
  },
  {
    id: 'RF-1005',
    source: 'SecurityScorecard API',
    risk: 'Server / X-Powered-By Header 노출',
    customer: 'Sample Manufacturing Co.',
    url: 'https://api.example.co.kr',
    observed: 'Server: nginx · X-Powered-By: Express',
    severity: 'Low',
    difficulty: 'Low',
    evidence: 'Partner Lab PoC Ready',
    guide: 'Drafted',
    delivery: 'Customer Reviewing',
    state: 'Customer Remediation In Progress'
  },
  {
    id: 'RF-1006',
    source: 'SecurityScorecard API',
    risk: 'CSP 미설정',
    customer: 'Sample Finance Corp.',
    url: 'https://secure.sample-finance.com/app',
    observed: 'Content-Security-Policy: Not Present',
    severity: 'High',
    difficulty: 'Medium',
    evidence: 'Partner Lab Evidence Pending',
    guide: 'Draft Needed',
    delivery: 'Not Delivered',
    state: 'SSC Re-scan Required'
  }
]

// Risk Finding 상세 데이터 (4개 영역 구성)
export const findingDetails = {
  'RF-1001': {
    ssc: {
      source: 'SecurityScorecard API',
      factor: 'Application Security',
      issueType: 'Missing Security Header (HSTS)',
      importedAt: '2026-06-30 16:20',
      scoreImpact: 'Medium',
      firstSeen: '2026-06-12',
      lastSeen: '2026-06-30',
      platformLink: 'https://platform.securityscorecard.io/#/issues/hsts (mock)'
    },
    observation: {
      url: 'https://www.example.co.kr',
      observedAt: '2026-06-30 16:30',
      httpStatus: '200 OK',
      headers: [
        { key: 'Strict-Transport-Security', value: 'Not Present', flag: 'danger' },
        { key: 'Content-Security-Policy', value: 'Not Present', flag: 'warning' },
        { key: 'Server', value: 'nginx', flag: 'neutral' },
        { key: 'X-Powered-By', value: 'Express', flag: 'warning' }
      ],
      console: '주요 오류 없음',
      screenshotLabel: '고객 도메인 관측 화면 (mock preview)'
    },
    guide: {
      summary:
        '일반적으로 HSTS는 브라우저가 해당 도메인에 대해 HTTPS 접속을 우선하도록 지시하는 보안 헤더입니다. ' +
        '웹서버, WAF, CDN, Reverse Proxy 등 실제 HTTP 응답 헤더를 제어하는 구간에서 적용 여부를 검토하는 것이 권장됩니다.',
      caution:
        '본 권고는 일반적인 보안 개선 방향이며, 고객사 운영 환경의 도메인 구조, 서브도메인, CDN, WAF, ' +
        '웹서버 구성에 따라 영향이 달라질 수 있습니다.',
      checklist: [
        'HTTPS 전구간(서브도메인 포함) 정상 서비스 여부 사전 확인',
        'includeSubDomains 적용 시 모든 하위 도메인 HTTPS 지원 여부 검토',
        'preload 적용은 되돌리기 어려우므로 신중한 사전 검토 권장'
      ]
    },
    lab: {
      before: {
        url: '/security-lab/hsts/vulnerable',
        hsts: 'Not Present',
        render: 'OK',
        assets: 'CSS/JS/Image Load OK',
        consoleError: 1
      },
      after: {
        url: '/security-lab/hsts/remediated',
        hsts: 'Present',
        render: 'OK',
        assets: 'CSS/JS/Image Load OK',
        consoleError: 0
      },
      diff: [
        { key: 'Strict-Transport-Security', before: 'Not Present', after: 'Present', changed: true },
        { key: 'Page Status', before: '200', after: '200', changed: false },
        { key: 'Render Check', before: 'OK', after: 'OK', changed: false }
      ]
    },
    currentState: 'Delivered to Customer'
  },
  'RF-1002': {
    ssc: {
      source: 'SecurityScorecard API',
      factor: 'Application Security',
      issueType: 'Missing Security Header (CSP)',
      importedAt: '2026-06-29 11:00',
      scoreImpact: 'High',
      firstSeen: '2026-06-09',
      lastSeen: '2026-06-29',
      platformLink: 'https://platform.securityscorecard.io/#/issues/csp (mock)'
    },
    observation: {
      url: 'https://secure.sample-finance.com',
      observedAt: '2026-06-29 11:12',
      httpStatus: '200 OK',
      headers: [
        { key: 'Content-Security-Policy', value: 'Not Present', flag: 'danger' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000', flag: 'success' },
        { key: 'Server', value: 'nginx', flag: 'neutral' },
        { key: 'X-Powered-By', value: '(not present)', flag: 'success' }
      ],
      console: '주요 오류 없음',
      screenshotLabel: '고객 도메인 관측 화면 (mock preview)'
    },
    guide: {
      summary:
        '일반적으로 CSP(Content-Security-Policy)는 브라우저가 로드할 수 있는 리소스 출처를 정책으로 제한하여 ' +
        '스크립트 인젝션 등의 영향 범위를 줄이는 보안 헤더입니다. 운영 중인 페이지의 정상 리소스가 차단되지 않도록 ' +
        'report-only 모드로 충분히 관측한 뒤 정책을 단계적으로 강화하는 방향이 권장됩니다.',
      caution:
        '본 권고는 일반적인 보안 개선 방향이며, 인라인 스크립트/스타일, 외부 위젯, 광고/분석 태그 등 ' +
        '고객사 페이지 구성에 따라 정책 영향이 크게 달라질 수 있습니다.',
      checklist: [
        '우선 Content-Security-Policy-Report-Only로 위반 리포트 수집 권장',
        '인라인 스크립트/스타일, 외부 CDN, 분석 태그 출처 목록화 필요',
        '정책 강화 전 주요 사용자 플로우 테스트 권장'
      ]
    },
    lab: {
      before: {
        url: '/security-lab/csp/vulnerable',
        hsts: 'N/A',
        render: 'OK',
        assets: 'CSS/JS/Image Load OK',
        consoleError: 0
      },
      after: {
        url: '/security-lab/csp/remediated',
        hsts: 'N/A',
        render: 'OK',
        assets: 'CSS/JS/Image Load OK (정책 내 출처)',
        consoleError: 0
      },
      diff: [
        { key: 'Content-Security-Policy', before: 'Not Present', after: "default-src 'self'; ...", changed: true },
        { key: 'Page Status', before: '200', after: '200', changed: false },
        { key: 'Render Check', before: 'OK', after: 'OK', changed: false }
      ]
    },
    currentState: 'Evidence Pack Ready'
  }
}

// ---------------------------------------------------------------------
// Remediation Guides
// ---------------------------------------------------------------------
export const guides = [
  {
    id: 'GUIDE-HSTS-01',
    risk: 'HSTS 미설정',
    version: 'v1.3',
    severity: 'High',
    difficulty: 'Low',
    serviceImpact: '낮음',
    validation: 'Validated',
    banCheck: 'Pass',
    reviewer: 'Minseok Lee',
    updated: '2026-06-28'
  },
  {
    id: 'GUIDE-CSP-01',
    risk: 'CSP 미설정',
    version: 'v0.9',
    severity: 'High',
    difficulty: 'Medium',
    serviceImpact: '중간',
    validation: 'In Review',
    banCheck: 'Pass',
    reviewer: 'Jiwon Park',
    updated: '2026-06-29'
  },
  {
    id: 'GUIDE-COOKIE-01',
    risk: 'Cookie Secure / HttpOnly / SameSite 미흡',
    version: 'v1.1',
    severity: 'Medium',
    difficulty: 'Low',
    serviceImpact: '낮음',
    validation: 'Validated',
    banCheck: 'Pass',
    reviewer: 'Minseok Lee',
    updated: '2026-06-26'
  },
  {
    id: 'GUIDE-MIXED-01',
    risk: 'Mixed Content',
    version: 'v0.4',
    severity: 'Medium',
    difficulty: 'Medium',
    serviceImpact: '중간',
    validation: 'Draft',
    banCheck: 'Review',
    reviewer: '—',
    updated: '2026-06-30'
  },
  {
    id: 'GUIDE-HDR-01',
    risk: 'Server / X-Powered-By Header 노출',
    version: 'v1.0',
    severity: 'Low',
    difficulty: 'Low',
    serviceImpact: '낮음',
    validation: 'Validated',
    banCheck: 'Pass',
    reviewer: 'Soyeon Kim',
    updated: '2026-06-24'
  }
]

// Guide 상세
export const guideDetail = {
  overview:
    '대상 도메인 응답에 HSTS 헤더가 관측되지 않았습니다. 본 가이드는 HSTS의 일반적 의미와 ' +
    '검토 시 고려사항을 정리한 보편 권고이며, 특정 고객 환경의 설정값을 단정하지 않습니다.',
  recommendation:
    '실제 HTTP 응답 헤더를 제어하는 구간(웹서버, Reverse Proxy, CDN, WAF 등)에서 ' +
    'Strict-Transport-Security 적용 여부를 검토하는 것이 일반적으로 권장됩니다. ' +
    'max-age, includeSubDomains, preload 옵션은 서비스 구조에 따라 영향이 다르므로 단계적 검토가 권장됩니다.',
  customerChecks: [
    'HTTPS 전구간(서브도메인 포함) 정상 서비스 여부',
    'includeSubDomains 적용 시 하위 도메인 영향 범위',
    'preload 적용의 비가역성에 대한 내부 합의'
  ],
  caution:
    '본 권고는 일반적인 보안 개선 방향이며, 고객사 운영 환경에 따라 영향이 달라질 수 있습니다. ' +
    '운영 반영 전 테스트가 필요합니다.',
  banChecks: [
    { label: '운영 명령어 없음', pass: true },
    { label: '단정 표현 없음', pass: true },
    { label: '조치 보장 표현 없음', pass: true },
    { label: '고객 환경 특정 설정값 단정 없음', pass: true }
  ]
}

// ---------------------------------------------------------------------
// Validation Sandbox
// ---------------------------------------------------------------------
export const sandboxRuns = [
  {
    id: 'RUN-2041',
    risk: 'HSTS 미설정',
    guideVersion: 'v1.3',
    status: 'PoC Evidence Generated',
    start: '2026-06-30 10:00:01',
    end: '2026-06-30 10:00:22',
    before: 'HSTS Not Present',
    after: 'HSTS Present',
    evidence: 'Partner Lab PoC Evidence Ready'
  },
  {
    id: 'RUN-2040',
    risk: 'CSP 미설정',
    guideVersion: 'v0.9',
    status: 'PoC Evidence Generated',
    start: '2026-06-29 14:11:03',
    end: '2026-06-29 14:11:29',
    before: 'CSP Not Present',
    after: 'CSP Present',
    evidence: 'Partner Lab PoC Evidence Ready'
  },
  {
    id: 'RUN-2039',
    risk: 'Cookie Secure 미흡',
    guideVersion: 'v1.1',
    status: 'Running',
    start: '2026-06-30 16:55:10',
    end: '—',
    before: 'collecting...',
    after: '—',
    evidence: 'Partner Lab Evidence Pending'
  },
  {
    id: 'RUN-2038',
    risk: 'Mixed Content',
    guideVersion: 'v0.4',
    status: 'Failed',
    start: '2026-06-28 09:30:00',
    end: '2026-06-28 09:30:12',
    before: 'partial',
    after: '—',
    evidence: 'None'
  }
]

export const sandboxLog = [
  '[10:00:01] Sandbox created',
  '[10:00:05] vulnerable-web started',
  '[10:00:07] remediated-web started',
  '[10:00:10] AI Browser Agent launched',
  '[10:00:13] Before screenshot captured',
  '[10:00:15] After screenshot captured',
  '[10:00:17] Header diff generated',
  '[10:00:20] Evidence artifacts saved',
  '[10:00:22] Sandbox terminated'
]

export const sandboxDetail = {
  headerDiff: [
    { key: 'Strict-Transport-Security', before: 'Not Present', after: 'max-age=31536000; includeSubDomains', changed: true },
    { key: 'HTTP Status', before: '200', after: '200', changed: false },
    { key: 'Render Check', before: 'OK', after: 'OK', changed: false },
    { key: 'Console Errors', before: '1', after: '0', changed: true }
  ],
  consoleSummary: 'Before: 1 warning · After: 0 error / 0 warning',
  networkSummary: 'Before: 24 requests / 0 blocked · After: 24 requests / 0 blocked (모든 리소스 정상 로드)'
}

// ---------------------------------------------------------------------
// Evidence Packs
// ---------------------------------------------------------------------
export const evidencePacks = [
  {
    id: 'EP-2026-014',
    title: 'HSTS 미설정 — 외부 관측 및 표준 검증 증적',
    customer: 'Acme Electronics',
    domain: 'www.example.co.kr',
    riskCount: 1,
    created: '2026-06-30',
    review: 'Approved',
    publish: 'Published',
    customerViewed: '열람'
  },
  {
    id: 'EP-2026-013',
    title: 'CSP 미설정 — 외부 관측 및 표준 검증 증적',
    customer: 'Globex Insurance',
    domain: 'secure.sample-finance.com',
    riskCount: 1,
    created: '2026-06-29',
    review: 'In Review',
    publish: 'Draft',
    customerViewed: '미열람'
  },
  {
    id: 'EP-2026-012',
    title: 'Header 노출 항목 — 외부 관측 및 표준 검증 증적',
    customer: 'Sample Manufacturing Co.',
    domain: 'api.example.co.kr',
    riskCount: 2,
    created: '2026-06-28',
    review: 'Approved',
    publish: 'Published',
    customerViewed: '열람'
  },
  {
    id: 'EP-2026-011',
    title: 'Cookie 속성 미흡 — 외부 관측 및 표준 검증 증적',
    customer: 'Acme Electronics',
    domain: 'portal.example.co.kr',
    riskCount: 1,
    created: '2026-06-26',
    review: 'In Review',
    publish: 'Draft',
    customerViewed: '미열람'
  }
]

// ---------------------------------------------------------------------
// Customer View (고객이 보는 단순 화면)
// ---------------------------------------------------------------------
export const customerView = {
  customer: 'Acme Electronics',
  domain: 'www.example.co.kr',
  risks: [
    {
      id: 'RF-1001',
      risk: 'HSTS 미설정',
      severity: 'High',
      observed: 'Strict-Transport-Security: Not Present',
      observedAt: '2026-06-30 16:30',
      recommendation:
        '일반적으로 HSTS는 브라우저가 HTTPS 접속을 우선하도록 지시하는 보안 헤더입니다. ' +
        '실제 응답 헤더를 제어하는 구간에서 적용 여부 검토가 권장됩니다.',
      sscFinding: 'SecurityScorecard Finding · Application Security · Missing Security Header (HSTS)',
      labProof: '표준 검증랩 참고 증적(PoC) — Before: HSTS Not Present → After: HSTS Present (Render OK)',
      checklist: [
        'HTTPS 전구간 정상 서비스 여부 확인',
        'includeSubDomains 영향 범위 검토',
        '운영 반영 전 테스트 진행',
        '조치 후 SecurityScorecard 재스캔 요청'
      ],
      status: '고객 내부 검토 중'
    },
    {
      id: 'RF-1005',
      risk: 'X-Powered-By Header 노출',
      severity: 'Low',
      observed: 'X-Powered-By: Express',
      observedAt: '2026-06-28 10:05',
      recommendation:
        '일반적으로 불필요한 기술 스택 정보 노출을 줄이기 위해 X-Powered-By 등 헤더 제거를 검토하는 것이 권장됩니다.',
      sscFinding: 'SecurityScorecard Finding · Application Security · Information Exposure (X-Powered-By)',
      labProof: '표준 검증랩 참고 증적(PoC) — Before: Header 노출 → After: Header 제거 (Render OK)',
      checklist: ['헤더 제거가 기능에 영향을 주지 않는지 검토', '운영 반영 전 테스트 진행', '조치 후 SecurityScorecard 재스캔 요청'],
      status: '적용 여부 검토 권장'
    }
  ]
}

// ---------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------
export const auditLog = [
  { time: '2026-06-30 16:42', user: 'AI Browser Agent', role: 'System', action: '검증랩 재현 실행 완료', target: 'RUN-2041', result: 'Success', ip: '10.20.3.11' },
  { time: '2026-06-30 15:58', user: 'Jiwon Park', role: 'Partner Engineer', action: 'Evidence Pack 생성', target: 'EP-2026-014', result: 'Created', ip: '10.20.4.22' },
  { time: '2026-06-30 15:21', user: 'Minseok Lee', role: 'Partner Engineer', action: 'Evidence Pack 고객 전달 준비', target: 'EP-2026-012', result: 'Ready', ip: '10.20.4.31' },
  { time: '2026-06-30 14:47', user: 'Customer Viewer', role: 'Customer Viewer', action: 'Evidence Pack 열람', target: 'EP-2026-011', result: 'Viewed', ip: '203.0.113.40' },
  { time: '2026-06-30 14:05', user: 'Customer Security Manager', role: 'Customer Security Manager', action: 'SSC 재스캔/공식 검증 요청', target: 'RF-1006', result: 'Requested', ip: '203.0.113.41' },
  { time: '2026-06-29 14:11', user: 'AI Browser Agent', role: 'System', action: '검증랩 재현 실행 완료', target: 'RUN-2040', result: 'Success', ip: '10.20.3.11' },
  { time: '2026-06-29 11:12', user: 'AI Browser Agent', role: 'System', action: '외부 관측 갱신', target: 'RF-1002', result: 'Observed', ip: '10.20.3.11' }
]

// =====================================================================
// 등록 / SSC Import 흐름용 mock data (이번 보완에서 추가)
// =====================================================================

// Source(수집 출처) 종류
export const SOURCES = ['SecurityScorecard API', 'External Observation', 'Partner Lab PoC', 'Manual Review']

// Dashboard 전체 운영 프로세스 (10단계) — SSC 재스캔/공식 검증 포함
export const processFlow = [
  { step: 1, label: '고객사 등록', nav: 'customers', desc: '파트너가 신규 고객사를 등록' },
  { step: 2, label: '도메인/스코프 등록', nav: 'domains', desc: '대표 도메인 및 점검 허용 범위 등록' },
  { step: 3, label: 'SSC 리스크 수집', nav: 'customers', desc: '점수·요인·이슈·리스크 수집' },
  { step: 4, label: '리스크 점검 생성', nav: 'findings', desc: '수집된 리스크를 항목으로 정리' },
  { step: 5, label: '검증랩 참고 증적 생성', nav: 'sandbox', desc: '검증랩에서 조치 전·후 참고 시연' },
  { step: 6, label: '증적 팩 생성', nav: 'evidence', desc: '리스크 + 관측값 + 참고 증적 + 권고 묶음' },
  { step: 7, label: '고객 전달', nav: 'customer-view', desc: '고객 전달 화면에서 미리보기 후 리포트 제공' },
  { step: 8, label: '고객 조치', nav: 'customer-view', desc: '고객 내부 검토 및 운영환경 조치' },
  { step: 9, label: 'SSC 재스캔 / 공식 검증', nav: 'findings', desc: 'SecurityScorecard 재스캔·공식 검증으로 해소 확인' }
]

// Risk Finding 상세 — Source Timeline (10단계)
export const sourceTimeline = [
  { key: 'import', label: 'SSC API Import', desc: 'SecurityScorecard에서 Finding 수집' },
  { key: 'observe', label: 'External Observation', desc: '고객 도메인 외부 관측값 확인' },
  { key: 'advisory', label: 'Advisory Draft', desc: '일반 조치 권고 초안 작성' },
  { key: 'poc', label: 'Partner Lab PoC Evidence', desc: '표준 검증랩 참고용 PoC 증적 생성' },
  { key: 'evidence', label: 'Evidence Pack', desc: 'Evidence Pack 구성' },
  { key: 'delivery', label: '고객 전달', desc: '고객 전달' },
  { key: 'remediation', label: '고객 조치', desc: '고객 내부 검토 및 조치' },
  { key: 'rescan-req', label: 'SSC Re-scan Required', desc: 'SecurityScorecard 재스캔/공식 검증 필요' },
  { key: 'rescan-ok', label: 'SSC Re-scan Confirmed', desc: '재스캔으로 Finding 해소 확인' }
]

// SSC Risk Import 진행 단계 (mock sync)
export const importStages = [
  'Portfolio 확인',
  'Domain Scorecard 조회',
  'Score / Factor 수집',
  'Issue / Finding 수집',
  'Risk Findings 생성',
  '완료'
]

// Mock SSC Risk Preview 결과
export const sscPreview = {
  score: 82,
  grade: 'B',
  factors: ['Application Security', 'Network Security', 'DNS Health'],
  findings: ['HSTS 미설정', 'CSP 미설정', 'Server Header 노출']
}

// Customer Registration Wizard 선택지
export const wizardOptions = {
  industries: ['전자/제조', '금융/보험', '제조', '금융', 'IT/서비스', '유통', '공공'],
  contractStatuses: ['Active', 'Review', 'Suspended'],
  engineers: ['Jiwon Park', 'Minseok Lee', 'Soyeon Kim'],
  consentStatuses: ['동의 완료', '검토 중', '미동의'],
  sscIntegration: 'Partner Managed API',
  portfolios: ['SSC-Partner-Portfolio-A', 'SSC-Partner-Portfolio-B']
}

// Evidence Pack 생성 근거 (6단계)
export const evidenceBasis = [
  '고객 도메인 등록',
  'SecurityScorecard API Risk Import',
  '고객 도메인 외부 관측값 확인',
  '파트너 표준 검증랩 참고용 PoC 증적 생성',
  '일반 조치 권고 연결'
]

// Validation Sandbox Run 메타 라벨 (역할 명확화)
export const sandboxRunMeta = [
  { label: '검증 대상', value: '파트너 표준 검증랩' },
  { label: '고객 운영환경 직접 변경', value: '없음' },
  { label: '고객 조치 완료 검증', value: '아님 (Not Customer Environment Validation)' },
  { label: 'SSC 공식 재스캔 대체 여부', value: '대체 불가' },
  { label: '증적 용도', value: '일반 조치 방향 참고용 PoC' },
  { label: '실제 Docker / AI 실행', value: 'mock' }
]

// SSC 재스캔 / 공식 검증 mock 액션 버튼
export const rescanActions = [
  { key: 'rescan', label: 'SSC 재스캔 요청 안내', },
  { key: 'status', label: '고객 조치 상태 업데이트', },
  { key: 'followup', label: 'Partner Follow-up 생성', }
]

// Evidence Pack A섹션 — SSC Finding Data (mock)
export const evidenceSscFinding = {
  source: 'SecurityScorecard API',
  issueType: 'Missing Security Header (HSTS)',
  factor: 'Application Security',
  severity: 'High',
  importedAt: '2026-06-30 16:20',
  scoreImpact: 'Medium',
  firstSeen: '2026-06-12',
  lastSeen: '2026-06-30',
  platformLink: 'https://platform.securityscorecard.io/#/issues/hsts (mock)'
}

// Evidence Pack E섹션 — 고객 내부 검토 체크리스트
export const customerReviewChecklist = [
  '보안 담당자 검토',
  '웹서비스 운영팀 검토',
  'WAF/CDN/Reverse Proxy 적용 위치 확인',
  '테스트 환경 검증',
  '변경 승인',
  '롤백 계획',
  '운영 반영 후 모니터링',
  'SSC 재스캔 요청 또는 공식 검증 절차 확인'
]
