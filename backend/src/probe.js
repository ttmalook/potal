// =====================================================================
// SecurityScorecard API Connection Probe
// 목적: Token 유효성 / GET 응답 / 권한 / Test Domain scope / Active Issues /
//       Metadata 조회 가능 여부를 read-only로 안전하게 검증.
// 원칙: 원본(raw) 전체를 노출하지 않고 "요약된 결과"만 반환.
// =====================================================================
import { get, config, tokenConfigured } from './securityScorecardClient.js'

// 개별 check 실행 → 표준 요약 결과로 변환 (요약 필드가 name/endpoint를 덮지 않도록 주의)
async function runCheck(name, endpoint, fn, summarize) {
  const res = await fn()
  if (res.ok) {
    return { name, endpoint, status: res.status, ok: true, ...(summarize ? summarize(res.data) : {}) }
  }
  return {
    name,
    endpoint,
    status: res.status ?? 0,
    ok: false,
    errorCode: res.error?.errorCode || 'SSC_ERROR',
    message: res.error?.message || 'unknown error'
  }
}

function asList(data, key) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data[key])) return data[key]
  if (data && Array.isArray(data.entries)) return data.entries
  return []
}
function countEntries(data, key) {
  const l = asList(data, key)
  return l.length ? l.length : Array.isArray(data) || data?.entries || data?.[key] ? l.length : null
}
function companyNameOf(d) {
  if (!d) return null
  if (d.name) return d.name
  const l = asList(d, 'entries')
  return l[0]?.name ?? null
}

// active-issues: issue_types 파라미터 필수 → 카탈로그 키 sample로 호출 (repeated → comma fallback)
async function fetchActiveIssues(domainEnc, sampleKeys) {
  const qp = new URLSearchParams()
  sampleKeys.forEach((t) => qp.append('issue_types', t))
  let r = await get(`/companies/${domainEnc}/active-issues?${qp.toString()}`)
  let mode = 'repeated'
  if (!r.ok) {
    r = await get(`/companies/${domainEnc}/active-issues?issue_types=${encodeURIComponent(sampleKeys.join(','))}`)
    mode = 'comma'
  }
  return { r, mode }
}

export async function runProbe() {
  const domain = config.testDomain
  const enc = encodeURIComponent(domain)
  const base = {
    ok: true,
    baseUrl: config.baseUrl,
    tokenConfigured: tokenConfigured(),
    testDomain: domain,
    writeTestsEnabled: config.enableWriteTests,
    deleteTestsEnabled: config.enableDeleteTests,
    checks: [],
    warnings: [],
    errors: []
  }

  if (!tokenConfigured()) {
    base.ok = false
    base.errors.push({ errorCode: 'SSC_TOKEN_MISSING', message: 'SSC_API_TOKEN이 설정되지 않아 probe를 건너뜁니다. backend/.env를 확인하세요.' })
    return base
  }

  const checks = base.checks

  checks.push(await runCheck('portfolios', 'GET /portfolios', () => get('/portfolios'), (d) => ({ entryCount: countEntries(d, 'entries') })))
  checks.push(await runCheck('allCompaniesByDomain', 'GET /all-companies?domain={domain}', () => get('/all-companies', { domain }), (d) => ({ entryCount: countEntries(d, 'entries') })))
  checks.push(await runCheck('followedCompany', 'GET /all-companies/{domain}', () => get(`/all-companies/${enc}`), (d) => ({ found: Boolean(d), companyName: companyNameOf(d) })))
  checks.push(await runCheck('companySummary', 'GET /companies/{domain}', () => get(`/companies/${enc}`), (d) => ({ score: d?.score ?? null, grade: d?.grade ?? null, scorecardId: d?.uuid ?? d?.id ?? d?.scorecard_id ?? null, industry: d?.industry ?? null })))
  checks.push(await runCheck('companyFactors', 'GET /companies/{domain}/factors', () => get(`/companies/${enc}/factors`), (d) => ({ factorCount: countEntries(d, 'entries') })))
  checks.push(await runCheck('metadataFactors', 'GET /metadata/factors', () => get('/metadata/factors'), (d) => ({ factorCount: countEntries(d, 'entries') })))

  // metadata/issue-types: 카운트 + 키 확보(active-issues 파라미터용)
  let issueTypeKeys = []
  const itRes = await get('/metadata/issue-types')
  if (itRes.ok) {
    const list = asList(itRes.data, 'entries')
    issueTypeKeys = list.map((e) => e.key || e.type || e.issue_type || e.slug).filter(Boolean)
    checks.push({ name: 'metadataIssueTypes', endpoint: 'GET /metadata/issue-types', status: itRes.status, ok: true, issueTypeCount: list.length })
  } else {
    checks.push({ name: 'metadataIssueTypes', endpoint: 'GET /metadata/issue-types', status: itRes.status ?? 0, ok: false, errorCode: itRes.error?.errorCode, message: itRes.error?.message })
  }

  // active-issues: 카탈로그 키 sample(안전 배치 10개)로 호출.
  // 주의: issue_types 파라미터 필수, 배치 25+는 400(요청당 개수 제한). 전체 수집은 카탈로그를 배치 순회해야 함.
  if (issueTypeKeys.length) {
    const sample = issueTypeKeys.slice(0, 10)
    const { r, mode } = await fetchActiveIssues(enc, sample)
    if (r.ok) {
      const arr = ['entries', 'issues', 'results', 'data'].map((k) => (Array.isArray(r.data?.[k]) ? r.data[k] : null)).find(Boolean)
      const errEnvelope = r.data && typeof r.data === 'object' && 'error' in r.data && r.data.error
      checks.push({
        name: 'activeIssues',
        endpoint: 'GET /companies/{domain}/active-issues?issue_types=...',
        status: r.status,
        ok: true,
        sampledIssueTypes: sample.length,
        paramMode: mode,
        activeIssueCount: Array.isArray(arr) ? arr.length : null,
        note: errEnvelope ? '200이나 error-keyed 엔벨로프 — 응답 스키마 확인 필요(등급 A로 sampled types 활성 이슈 없음 추정). 전체 수집은 issue_types 배치(≤10) 순회 필요.' : '배치 크기 ≤10 권장(25+는 400).'
      })
    } else {
      checks.push({ name: 'activeIssues', endpoint: 'GET /companies/{domain}/active-issues?issue_types=...', status: r.status ?? 0, ok: false, errorCode: r.error?.errorCode, message: r.error?.message })
    }
  } else {
    checks.push({ name: 'activeIssues', endpoint: 'GET /companies/{domain}/active-issues', status: 0, ok: false, errorCode: 'SSC_SKIPPED', message: 'issue-types 카탈로그 미확보로 active-issues 스킵(issue_types 파라미터 필수).' })
  }

  checks.push(await runCheck('reportsRecent', 'GET /reports/recent', () => get('/reports/recent'), (d) => ({ reportCount: countEntries(d, 'entries') })))

  // 결과 분류: 403/404 → warnings, 그 외 실패 → errors
  for (const c of checks) {
    if (c.ok) continue
    if (['SSC_FORBIDDEN', 'SSC_NOT_FOUND'].includes(c.errorCode)) {
      base.warnings.push({ name: c.name, endpoint: c.endpoint, errorCode: c.errorCode, message: c.message })
    } else if (c.errorCode !== 'SSC_SKIPPED') {
      base.errors.push({ name: c.name, endpoint: c.endpoint, errorCode: c.errorCode, message: c.message })
    }
  }

  const followed = checks.find((c) => c.name === 'followedCompany')
  if (followed && !followed.ok && followed.errorCode === 'SSC_NOT_FOUND') {
    base.warnings.push({ name: 'scopeHint', endpoint: '-', errorCode: 'SSC_SCOPE_HINT', message: `${domain}이(가) Followed/Portfolio에 없을 수 있습니다. 먼저 Portfolio에 회사를 추가해야 할 수 있습니다.` })
  }

  base.ok = base.errors.length === 0
  return base
}

// Health: 실행/토큰 설정 여부만 (Token 값 미노출)
export function health() {
  return {
    ok: true,
    baseUrl: config.baseUrl,
    tokenConfigured: tokenConfigured(),
    testDomain: config.testDomain,
    writeTestsEnabled: config.enableWriteTests,
    deleteTestsEnabled: config.enableDeleteTests
  }
}
