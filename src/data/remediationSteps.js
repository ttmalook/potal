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
  },
  redirect_chain_contains_http: {
    why: 'HTTPS로 시작한 요청이 리다이렉트 체인 중간에 평문 HTTP 홉을 거치면 그 구간에서 도청·세션 탈취·다운그레이드가 가능합니다. 리다이렉트의 모든 단계를 HTTPS로 유지해야 합니다.',
    steps: [
      '리다이렉트 체인을 확인합니다: curl -sIL http://<대상> (Location 헤더의 모든 홉 점검).',
      '중간에 http:// 로 가는 홉을 https:// 로 교체합니다(웹서버·앱·CDN 리다이렉트 규칙).',
      '첫 진입도 http→https(301)로 강제하고, 최종 목적지가 https 인지 확인합니다.',
      'HSTS(Strict-Transport-Security)를 적용해 브라우저가 https 를 고정하게 합니다.',
      '배포 후 SSC 재스캔으로 해소를 확인합니다.'
    ],
    verify: ['curl -sIL http://<대상> 응답의 모든 Location 이 https 인지 확인']
  },
  hosted_on_object_storage: {
    why: '웹 자산이 오브젝트 스토리지(S3·GCS·Blob 등)에 직접 호스팅되면, 버킷 권한이 잘못 설정될 경우 파일이 공개 노출·목록화·변조될 수 있습니다. 공개 접근을 차단하고 CDN·서명 URL 경유로 제공해야 합니다.',
    steps: [
      '해당 버킷의 퍼블릭 액세스 차단(Block Public Access)을 활성화합니다.',
      '버킷 정책·ACL을 최소 권한으로 정리하고 익명 읽기를 제거합니다.',
      '공개가 필요한 자산은 CDN(CloudFront 등) + OAI/서명 URL 로만 노출합니다.',
      '버킷 로깅·버전 관리·서버측 암호화(SSE)를 활성화합니다.',
      '배포 후 SSC 재스캔으로 확인합니다.'
    ],
    verify: ['버킷 URL 직접 접근 시 AccessDenied · 목록 조회 차단 확인']
  },
  compromised_credentials_found: {
    why: '이 도메인과 연관된 계정·비밀번호가 외부 유출 데이터에서 발견되었습니다. 방치하면 계정 탈취·크리덴셜 스터핑으로 이어질 수 있어, 해당 자격증명을 즉시 무효화하고 다중인증을 강제해야 합니다.',
    steps: [
      '유출된 계정의 비밀번호를 즉시 재설정하고 활성 세션을 폐기합니다.',
      '전 계정에 다중인증(MFA)을 강제하고 비밀번호 재사용을 차단합니다.',
      '유출 비밀번호 사전(HIBP 등) 대조로 재사용 여부를 점검합니다.',
      '해당 계정의 최근 접근·이상 로그인을 조사합니다.',
      '유출 모니터링을 설정하고 SSC 재스캔으로 확인합니다.'
    ],
    verify: ['해당 계정 로그인 시 MFA 요구 및 이전 비밀번호 거부 확인']
  },
  service_pop3: {
    why: 'POP3(110/평문) 서비스가 외부에 노출되면 자격증명이 평문으로 오가고 무차별 대입 공격의 표적이 됩니다. 불필요하면 비활성화하고, 필요하면 암호화(POP3S/995)와 접근 제한만 허용해야 합니다.',
    steps: [
      'POP3 서비스의 필요성을 검토합니다(대부분 IMAP/웹메일로 대체 가능).',
      '불필요하면 서비스를 중지하고 110 포트를 차단합니다.',
      '필요하면 평문 POP3를 끄고 POP3S(995/TLS)만 허용합니다.',
      '방화벽으로 접근 출발지를 최소 범위로 제한합니다.',
      '배포 후 SSC 재스캔으로 확인합니다.'
    ],
    verify: ['nmap -p110,995 <대상> — 110 미개방 · 995(TLS)만 확인']
  },
  service_vuln_host_v3_medium: {
    why: '알려진 취약점(CVE)이 있는 소프트웨어·서비스 버전이 외부에서 관측되었습니다. 공개 익스플로잇 대상이 될 수 있어, 해당 컴포넌트를 패치·업그레이드하고 불필요한 노출을 제거해야 합니다.',
    steps: [
      'SSC 관측값에서 취약 컴포넌트·버전을 확인합니다.',
      '해당 소프트웨어/OS를 보안 패치·최신 버전으로 업그레이드합니다.',
      '불필요한 서비스·포트는 비활성화하고 노출을 제거합니다.',
      '정기 패치 관리 체계(취약점 스캔·업데이트 주기)를 수립합니다.',
      '배포 후 SSC 재스캔으로 확인합니다.'
    ],
    verify: ['업그레이드 후 버전 배너·스캐너로 해당 CVE 미해당 확인']
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
  insecure_https_redirect_pattern: { severity: 'medium', category: 'TLS/Certificate', difficulty: '낮음', impact: '중간' },
  redirect_chain_contains_http: { severity: 'medium', category: 'TLS/Certificate', difficulty: '낮음', impact: '중간' },
  hosted_on_object_storage: { severity: 'low', category: '정보보호 일반', difficulty: '중간', impact: '중간' },
  compromised_credentials_found: { severity: 'low', category: '계정 보안', difficulty: '중간', impact: '높음' },
  service_pop3: { severity: 'medium', category: '네트워크 보안', difficulty: '중간', impact: '중간' },
  service_vuln_host_v3_medium: { severity: 'low', category: '패치 관리', difficulty: '중간', impact: '높음' }
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
