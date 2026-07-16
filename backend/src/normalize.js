// =====================================================================
// SecurityScorecard 응답 → 내부 UI 친화 형태 정규화
// =====================================================================

// issue_type 원문 → 보기 좋은 제목 (예: domain_missing_https_v2 → Domain Missing HTTPS)
export function titleize(issueType) {
  if (!issueType) return 'Unknown Issue'
  return String(issueType)
    .replace(/_v\d+$/i, '') // 버전 접미사 제거
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (w.toLowerCase() === 'https' || w.toLowerCase() === 'http' || w.toLowerCase() === 'ssl' || w.toLowerCase() === 'tls' || w.toLowerCase() === 'spf' || w.toLowerCase() === 'dkim' || w.toLowerCase() === 'dmarc' || w.toLowerCase() === 'hsts' || w.toLowerCase() === 'csp' || w.toLowerCase() === 'dns' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// 자주 등장하는 issue_type 한국어 매핑 (없으면 titleize fallback)
const KO_MAP = {
  hsts_incorrect: 'HSTS 미설정',
  hsts_preloaded_incorrect: 'HSTS Preload 미흡',
  csp_no_policy: 'CSP 미설정',
  content_security_policy_missing: 'CSP 미설정',
  x_powered_by_present: 'X-Powered-By Header 노출',
  server_version_exposed: 'Server Header 노출',
  cookie_missing_secure_attribute: 'Cookie Secure 미흡',
  cookie_missing_http_only: 'Cookie HttpOnly 미흡',
  insecure_https_redirect_pattern: 'HTTPS 리다이렉트 미흡',
  domain_missing_https: 'Domain Missing HTTPS',
  domain_missing_https_v2: 'Domain Missing HTTPS',
  spf_record_missing: 'SPF Record 미설정',
  spf_record_wildcard: 'SPF Record Wildcard',
  dmarc_record_missing: 'DMARC Record 미설정',
  dkim_record_missing: 'DKIM Record 미설정',
  tlscert_expired: 'TLS 인증서 만료',
  tls_weak_cipher: 'TLS 취약 Cipher'
}

export function findingTypeLabel(issueType) {
  if (!issueType) return 'Unknown Issue'
  return KO_MAP[issueType] || titleize(issueType)
}

// SSC severity → 표준 라벨
export function mapSeverity(sev) {
  if (!sev) return 'Low'
  const s = String(sev).toLowerCase()
  if (s.includes('critical')) return 'Critical'
  if (s.includes('high')) return 'High'
  if (s.includes('medium') || s.includes('moderate')) return 'Medium'
  if (s.includes('low')) return 'Low'
  if (s.includes('info') || s.includes('positive')) return 'Info'
  return 'Low'
}

// score_impact 숫자 → 라벨
export function impactLabel(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  const a = Math.abs(n)
  if (a >= 5) return 'High'
  if (a >= 2) return 'Medium'
  return 'Low'
}

// summary 정규화
export function normalizeSummary(raw) {
  if (!raw || typeof raw !== 'object') return { score: null, grade: null, scorecardId: null, name: null, domain: null }
  return {
    score: raw.score ?? null,
    grade: raw.grade ?? raw.grade_letter ?? null,
    scorecardId: raw.id ?? raw.scorecard_id ?? null,
    name: raw.name ?? null,
    domain: raw.domain ?? null
  }
}

// factors 정규화 (entries[] 또는 배열 모두 지원)
export function normalizeFactors(raw) {
  const list = Array.isArray(raw) ? raw : raw?.entries || raw?.factors || []
  return list.map((f) => ({
    name: f.name ?? f.factor ?? null,
    score: f.score ?? null,
    grade: f.grade ?? null,
    issueCount: f.issue_summary?.total ?? f.total ?? null
  }))
}

// issues 정규화
function issueList(raw) {
  if (Array.isArray(raw)) return raw
  return raw?.entries || raw?.issues || raw?.data || []
}

export function normalizeIssues(raw) {
  return issueList(raw).map((it) => ({
    issueType: it.type ?? it.issue_type ?? null,
    severity: it.severity ?? null,
    factorName: it.factor ?? it.factor_name ?? null,
    issueCount: it.count ?? it.issue_count ?? null,
    totalScoreImpact: it.total_score_impact ?? null,
    factorScoreImpact: it.factor_score_impact ?? null,
    firstSeen: it.first_seen_time ?? it.first_seen ?? null,
    lastSeen: it.last_seen_time ?? it.last_seen ?? null,
    status: it.status ?? null
  }))
}

// issue → 내부 Risk Finding 형태
export function toFinding(issue, idx, customerName, domain, importedAt) {
  return {
    id: `ssc-import-${String(idx + 1).padStart(3, '0')}`,
    customerName: customerName || null,
    targetUrl: `https://${domain}`,
    source: 'SecurityScorecard API',
    findingType: findingTypeLabel(issue.issueType),
    issueType: issue.issueType,
    severity: mapSeverity(issue.severity),
    sscFactor: issue.factorName ? titleize(issue.factorName) : null,
    occurrenceCount: issue.issueCount ?? null,
    scoreImpact: impactLabel(issue.totalScoreImpact),
    firstSeen: issue.firstSeen ?? null,
    lastSeen: issue.lastSeen ?? null,
    evidenceStatus: 'Partner Lab Evidence Pending',
    guideStatus: 'Draft Needed',
    reviewStatus: 'Not Started',
    deliveryStatus: 'Not Delivered',
    workflowState: 'SSC Risk Imported',
    importedAt
  }
}

// metadata/issue-types 정규화
export function normalizeIssueTypes(raw) {
  const list = Array.isArray(raw) ? raw : raw?.entries || raw?.issue_types || []
  return list.map((m) => ({
    issueType: m.key ?? m.type ?? m.issue_type ?? null,
    title: m.title ?? m.short_name ?? (m.key ? titleize(m.key) : null),
    description: m.description ?? null,
    recommendation: m.recommendation ?? null,
    factor: m.factor ?? m.factor_name ?? null,
    severity: m.severity ? mapSeverity(m.severity) : null
  }))
}
