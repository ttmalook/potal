// =====================================================================
// SSC 리스크 유형별 "한글 단계별 조치 절차" (조치 가이드 화면용)
//  - 검증랩 카탈로그(SANDBOX_CATALOG) 지원 유형 → whereToChange/configDiff/verification 재사용
//  - 카탈로그 미지원(재현 데모 없음) 유형 → 여기서 단계+예시코드 직접 작성
//  - 리스크 점검(진단)과 분리: 여기서는 "그래서 어떻게 고치나"를 실행 단위로 제공
// =====================================================================
import { catalogEntry, catalogNameKo, SANDBOX_CATALOG } from './sandboxCatalog.js'

const repKey = (t) => String(t || '').toLowerCase().replace(/_v\d+$/, '')

// 카탈로그 미지원이지만 표준 조치가 명확한 유형 — 한글 단계 + 예시 코드
const REMEDIATION_STEPS = {
  unsafe_sri: {
    why: '외부 CDN에서 불러오는 스크립트·스타일에 무결성 해시(SRI)가 없으면, CDN 침해나 중간자 공격으로 리소스가 변조돼도 브라우저가 그대로 실행합니다. integrity 속성으로 원본 해시와 일치할 때만 로드되도록 강제해야 합니다.',
    steps: [
      '관측된 외부 스크립트·스타일 목록을 확인합니다 (리스크 점검 → 관측 증거).',
      '각 리소스의 무결성 해시(SHA-384)를 생성합니다.',
      '각 <script>/<link> 태그에 integrity 와 crossorigin="anonymous" 속성을 추가합니다.',
      '프로토콜 상대 URL(//example.com/…)은 https:// 로 고정합니다.',
      '리소스 버전이 바뀌면 해시도 함께 갱신하거나 버전을 고정합니다.',
      '배포 후 SSC 재스캔으로 해소를 확인합니다.'
    ],
    example: {
      lang: 'html',
      code: `<!-- 해시 생성(터미널): curl -s <URL> | openssl dgst -sha384 -binary | openssl base64 -A -->
<script src="https://cdn.jsdelivr.net/npm/@fullcalendar/google-calendar@6.1.11/index.global.min.js"
        integrity="sha384-<생성된해시>"
        crossorigin="anonymous"></script>`
    },
    verify: [
      'https://www.srihash.org 에서 URL로 해시 생성·검증',
      '브라우저 DevTools → Network 에서 해당 스크립트가 정상 로드되는지 확인'
    ]
  },
  x_content_type_options_incorrect: {
    why: 'X-Content-Type-Options: nosniff 헤더가 없으면 브라우저가 MIME 스니핑으로 콘텐츠 유형을 추측·오해석해, 이미지·텍스트로 위장한 응답이 스크립트로 실행되는 등 XSS 위험이 커집니다.',
    steps: [
      '웹서버/리버스프록시 응답 헤더에 X-Content-Type-Options: nosniff 를 추가합니다.',
      '특정 경로가 아니라 전체 응답에 적용되도록 전역 설정에 넣습니다.',
      '배포 후 SSC 재스캔으로 확인합니다.'
    ],
    example: {
      lang: 'nginx',
      code: `# nginx
add_header X-Content-Type-Options "nosniff" always;

# Apache
Header always set X-Content-Type-Options "nosniff"`
    },
    verify: ['curl -I https://<대상> 응답에서 X-Content-Type-Options: nosniff 확인']
  },
  domain_missing_https: {
    why: 'HTTPS가 적용되지 않으면 로그인 정보·세션·개인정보가 평문(HTTP)으로 오가 도청·중간자 공격·변조에 노출됩니다. 유효한 TLS 인증서를 적용하고 모든 HTTP 요청을 HTTPS로 강제(301)해야 합니다.',
    steps: [
      '유효한 TLS 인증서를 발급·적용합니다 (예: Let’s Encrypt).',
      '모든 HTTP(80) 요청을 HTTPS(443)로 301 리다이렉트합니다.',
      '리다이렉트 최종 목적지가 HTTPS인지 확인합니다.',
      '배포 후 SSC 재스캔으로 확인합니다.'
    ],
    example: {
      lang: 'nginx',
      code: `server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;   # HTTP → HTTPS 강제
}`
    },
    verify: [
      'curl -I http://<대상> → 301, Location: https://…',
      'https://<대상> 정상 접속 및 인증서 유효 확인'
    ]
  },
  insecure_https_redirect_pattern: {
    steps: [
      'HTTP→HTTPS 리다이렉트 체인에 중간 평문(HTTP) 홉이 없는지 점검합니다.',
      '최종 목적지가 HTTPS이고 오픈 리다이렉트가 없는지 확인합니다.',
      '한 번의 301로 HTTPS 최종 URL에 도달하도록 규칙을 통일합니다.',
      '배포 후 SSC 재스캔으로 확인합니다.'
    ],
    example: {
      lang: 'nginx',
      code: `# 평문 경유 없이 곧바로 HTTPS 최종 URL로
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}`
    },
    verify: ['curl -sIL http://<대상> 로 리다이렉트 체인 확인 (평문 HTTP 홉이 없어야 함)']
  }
}

// issue_type → 정규화된 조치 가이드 (지원=카탈로그 재사용 / 미지원=REMEDIATION_STEPS / 없음)
export function getRemediationGuide(issueType) {
  const rep = repKey(issueType)
  const title = catalogNameKo(issueType)
  const custom = REMEDIATION_STEPS[rep]
  if (custom) return { issueType, title, kind: 'steps', why: custom.why || null, where: custom.where || [], steps: custom.steps, example: custom.example, verify: custom.verify }
  const entry = catalogEntry(issueType)
  if (entry) {
    return {
      issueType,
      title,
      kind: 'catalog',
      why: entry.why || null,
      where: entry.whereToChange || [],
      diff: entry.configDiff || null,
      verify: entry.verification || []
    }
  }
  return { issueType, title, kind: 'none' }
}

export function hasRemediationGuide(issueType) {
  return getRemediationGuide(issueType).kind !== 'none'
}

// 조치 절차가 있는 유형 목록 (카탈로그 대표 key + 미지원 커스텀 key) — 중복 제거
export const GUIDE_ISSUE_TYPES = [
  ...new Set([...SANDBOX_CATALOG.map((e) => e.key), ...Object.keys(REMEDIATION_STEPS)])
]

// 유형별 조치 난이도·서비스 영향 (Phase 1 확정 초안)
//  - 난이도: "어디를 어떻게 바꾸나" (remediation_mode 파생 규칙 + 일부 override)
//  - 영향 : "오적용 시 클라이언트/기능 파급" rubric — 표기/제거=낮음, 정책성=중간, 프로토콜/네트워크=높음
//  - severity/category: 카탈로그 밖(REMEDIATION_STEPS 전용) 유형은 여기서 보완
export const GUIDE_TYPE_META = {
  // ── HTTP/Web Header ──
  hsts_incorrect: { difficulty: '낮음', impact: '중간' },
  cookie_missing_http_only: { difficulty: '중간', impact: '낮음' },
  cookie_missing_secure_attribute: { difficulty: '중간', impact: '중간' },
  csp_no_policy: { difficulty: '낮음', impact: '중간' },
  x_powered_by_present: { difficulty: '낮음', impact: '낮음' },
  server_version_exposed: { difficulty: '낮음', impact: '낮음' },
  // ── TLS/Certificate ──
  tls_weak_protocol: { difficulty: '중간', impact: '높음' },
  tls_weak_cipher: { difficulty: '중간', impact: '높음' },
  tlscert_excessive_expiration: { difficulty: '낮음', impact: '낮음' },
  // ── DNS/Email ──
  spf_record_missing: { difficulty: '낮음', impact: '낮음' },
  dmarc_record_missing: { difficulty: '낮음', impact: '중간' },
  dkim_record_missing: { difficulty: '중간', impact: '낮음' },
  // ── Network Service ──
  service_pptp: { difficulty: '중간', impact: '높음' },
  open_port: { difficulty: '중간', impact: '중간' },
  insecure_telnet: { difficulty: '중간', impact: '높음' },
  insecure_ftp: { difficulty: '중간', impact: '높음' },
  service_rdp: { difficulty: '중간', impact: '높음' },
  // ── 카탈로그 밖(REMEDIATION_STEPS 전용) — severity·category 보완 ──
  unsafe_sri: { severity: 'medium', category: 'HTTP/Web Header', difficulty: '중간', impact: '중간' },
  x_content_type_options_incorrect: { severity: 'low', category: 'HTTP/Web Header', difficulty: '낮음', impact: '낮음' },
  domain_missing_https: { severity: 'high', category: 'TLS/Certificate', difficulty: '중간', impact: '높음' },
  insecure_https_redirect_pattern: { severity: 'medium', category: 'TLS/Certificate', difficulty: '낮음', impact: '중간' }
}

// 조치 가이드 행(row) 메타 — 카탈로그 + GUIDE_TYPE_META 병합. 표/드로어 공용.
export function guideRowMeta(issueType) {
  const rep = repKey(issueType)
  const entry = catalogEntry(issueType)
  const m = GUIDE_TYPE_META[rep] || {}
  return {
    key: rep,
    name: catalogNameKo(issueType),                 // 한글 명칭 (Risk Finding)
    displayName: entry?.display_name || issueType,  // 영문 (Issue Type)
    category: entry?.category || m.category || '—',
    severity: entry?.severity || m.severity || null,
    difficulty: m.difficulty || '중간',
    impact: m.impact || '중간',
    kind: getRemediationGuide(issueType).kind       // 'catalog' | 'steps' | 'none'
  }
}
