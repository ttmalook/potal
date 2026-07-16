// =====================================================================
// SecurityScorecard Common Issue Collector (프로토타입, read-only)
// 설계 핵심:
//  - issue_type별 전용 함수 금지 → 카탈로그 + 공통 수집기.
//  - 효율: factors[].issue_summary[] 로 "도메인의 활성 issue type + count"를 먼저 확보하고,
//          그 타입만 active-issues 로 조회한다(무차별 241 스캔 금지).
//  - active-issues 는 issue_types 파라미터 필수, 배치 ≤10.
//  - 이 모듈은 라우트에 연결되어 있지 않다(화면 미연결). 호출은 명시적 실행 시에만.
// =====================================================================
import { get } from './securityScorecardClient.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const arrIn = (d) => {
  if (Array.isArray(d)) return d
  for (const k of ['entries', 'issues', 'results', 'data']) if (Array.isArray(d?.[k])) return d[k]
  return []
}

// ---------------------------------------------------------------------
// Metadata 캐시 (issue-types / factors). TTL 6h. force는 내부 갱신용.
// ---------------------------------------------------------------------
const TTL_MS = 6 * 60 * 60 * 1000
const _cache = { issueTypes: null, factors: null }
const _fresh = (e) => e && e.expiresAt > Date.now()

// 1) Issue Type Catalog: metadata/issue-types → key → {factor,severity,title} (캐시)
export async function getIssueTypeCatalog({ force = false } = {}) {
  if (!force && _fresh(_cache.issueTypes)) return { ..._cache.issueTypes.value, cacheHit: true }
  const r = await get('/metadata/issue-types')
  if (!r.ok) return { ok: false, error: r.error, cacheHit: false }
  const list = arrIn(r.data)
  const byKey = {}
  for (const e of list) if (e.key) byKey[e.key] = { key: e.key, factor: e.factor ?? null, severity: e.severity ?? null, title: e.title ?? null }
  const value = { ok: true, count: list.length, byKey, keys: Object.keys(byKey) }
  _cache.issueTypes = { value, expiresAt: Date.now() + TTL_MS }
  return { ...value, cacheHit: false }
}

// 1b) Factor 메타데이터 (캐시) — 응답 metadataCache 표기 및 factor 라벨 매핑용
export async function getFactorMetadataCatalog({ force = false } = {}) {
  if (!force && _fresh(_cache.factors)) return { ..._cache.factors.value, cacheHit: true }
  const r = await get('/metadata/factors')
  if (!r.ok) return { ok: false, error: r.error, cacheHit: false }
  const list = arrIn(r.data)
  const byKey = {}
  for (const e of list) { const k = e.name || e.key; if (k) byKey[k] = { name: k, title: e.title ?? null } }
  const value = { ok: true, count: list.length, byKey }
  _cache.factors = { value, expiresAt: Date.now() + TTL_MS }
  return { ...value, cacheHit: false }
}

// scope guard: /all-companies/{domain} — 200이면 in-scope, 403/404면 scope 밖(안전)
export async function isDomainInScope(domain) {
  const r = await get(`/all-companies/${encodeURIComponent(domain)}`)
  if (r.ok) return { ok: true, inScope: true }
  const code = r.error?.errorCode
  if (code === 'SSC_FORBIDDEN' || code === 'SSC_NOT_FOUND') return { ok: true, inScope: false }
  return { ok: false, inScope: false, errorCode: code || 'SSC_ERROR', message: r.error?.message }
}

// 필터/정렬/페이지네이션 (정규화 finding 리스트 대상)
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
export function applyView(findings, { severity, factor, includeInfo = true, limit = 20, offset = 0 } = {}) {
  let list = [...findings]
  if (Array.isArray(severity) && severity.length) { const set = new Set(severity.map((s) => s.toLowerCase())); list = list.filter((f) => set.has(String(f.severity || '').toLowerCase())) }
  if (!includeInfo) list = list.filter((f) => String(f.severity || '').toLowerCase() !== 'info')
  if (Array.isArray(factor) && factor.length) { const set = new Set(factor); list = list.filter((f) => set.has(f.factor)) }
  list.sort((a, b) => {
    const sa = SEV_ORDER[String(a.severity || '').toLowerCase()] ?? 5
    const sb = SEV_ORDER[String(b.severity || '').toLowerCase()] ?? 5
    if (sa !== sb) return sa - sb
    if ((a.factor || '') !== (b.factor || '')) return (a.factor || '').localeCompare(b.factor || '')
    const la = a.last_seen || '', lb = b.last_seen || ''
    if (la !== lb) return lb.localeCompare(la)
    return (a.issue_type || '').localeCompare(b.issue_type || '')
  })
  const total = list.length
  const page = list.slice(offset, offset + limit)
  const returnedCount = page.length
  const hasMore = offset + returnedCount < total
  return { page, total, returnedCount, hasMore, nextOffset: hasMore ? offset + limit : null }
}

// 2) 도메인의 활성 issue type + count (factors.issue_summary 기반 — 효율적, 무차별 스캔 회피)
export async function getActiveIssueTypesForDomain(domain) {
  const enc = encodeURIComponent(domain)
  const r = await get(`/companies/${enc}/factors`)
  if (!r.ok) return { ok: false, error: r.error }
  const factors = arrIn(r.data)
  const types = []
  for (const f of factors) {
    const summ = Array.isArray(f.issue_summary) ? f.issue_summary : []
    for (const s of summ) if (s?.type) types.push({ type: s.type, factor: f.name ?? null, count: s.count ?? null, severity: s.severity ?? null, total_score_impact: s.total_score_impact ?? null })
  }
  return { ok: true, factorCount: factors.length, types }
}

// 3) active-issues 배치 호출 (issue_types ≤ batchSize). 실패/empty batch는 warning 처리하고 계속 진행.
export async function getActiveIssuesByBatch(domain, issueTypeKeys, { batchSize = 10, spacingMs = 120 } = {}) {
  const enc = encodeURIComponent(domain)
  const batches = chunk([...new Set(issueTypeKeys)], batchSize)
  const issueTypeResults = [] // { name, issues_count, issues:[...] }
  const warnings = []
  let totalActiveIssues = 0
  for (let i = 0; i < batches.length; i++) {
    const qp = new URLSearchParams()
    batches[i].forEach((k) => qp.append('issue_types', k))
    const r = await get(`/companies/${enc}/active-issues?${qp.toString()}`)
    if (!r.ok) {
      warnings.push({ batch: i, status: r.status, errorCode: r.error?.errorCode, keys: batches[i] })
      await sleep(spacingMs)
      continue
    }
    const d = r.data || {}
    // empty envelope: {error:{statusCode:404}} → 요청 타입이 활성 아님. 정상(스킵).
    if (d.error) { await sleep(spacingMs); continue }
    if (typeof d.total_active_issues === 'number') totalActiveIssues += d.total_active_issues
    for (const it of (Array.isArray(d.issue_types) ? d.issue_types : [])) issueTypeResults.push(it)
    await sleep(spacingMs)
  }
  return { issueTypeResults, warnings, requestedBatches: batches.length, totalActiveIssues }
}

// 4) 단일 active issue(finding) → portal risk_finding 정규화
export function normalizeActiveIssue(finding, typeName, ctx = {}) {
  const meta = ctx.catalogByKey?.[typeName] || {}
  const obs = Array.isArray(finding.observations) ? finding.observations : []
  // 관측된 실제 대상 URL(final_url)과 증거(evidence) 확보 — 위생 처리(쿼리·자격증명 제거)
  const primaryObs = obs.find((o) => o && o.final_url) || obs[0] || {}
  const finalUrl = primaryObs.final_url || finding.url || null
  const evidence = []
  for (const o of obs) for (const e of (o?.evidence || [])) if (e) evidence.push(clampText(sanitizeEvidence(e), 200))
  const assetUrl = sanitizeUrl(finalUrl)
  return {
    finding_id: finding.issue_id ? `ssc:${finding.issue_id}` : `ssc:${ctx.domain}:${typeName}:${finding.url || finding.domain || ''}`,
    source: 'SecurityScorecard API',
    scorecard_identifier: ctx.scorecardId ?? null,
    domain: finding.domain ?? ctx.domain ?? null,
    issue_type: typeName,
    issue_title: meta.title ?? typeName,
    factor: meta.factor ?? ctx.typeFactor?.[typeName] ?? null,
    severity: meta.severity ?? ctx.typeSeverity?.[typeName] ?? null,
    status: finding.group_status ?? 'active',
    first_seen: finding.first_seen_time ?? null,
    last_seen: finding.last_seen_time ?? null,
    asset_type: assetUrl ? 'url' : finding.ip ? 'ip' : finding.domain ? 'domain' : null,
    asset_value: assetUrl ?? finding.domain ?? finding.ip ?? null,
    evidence: evidence.slice(0, 8),
    ip: finding.ip ?? pickObs(obs, 'ip') ?? null,
    port: finding.port ?? pickObs(obs, 'port') ?? null,
    protocol: finding.protocol ?? pickObs(obs, 'protocol') ?? null,
    evidence_summary: summarizeObservations(obs),
    recommendation_summary: null, // metadata/issue-types/{type} 또는 issue-context에서 보강(선택)
    raw_reference_keys: { issue_id: finding.issue_id ?? null, sources: (finding.sources || []).length, observations: obs.length },
    collected_at: ctx.collectedAt ?? null
  }
}

// URL 위생 처리: 스킴+host+path만 남기고 쿼리·프래그먼트·자격증명 제거
function sanitizeUrl(u) {
  if (!u) return null
  let s = String(u).trim()
  s = s.replace(/(:\/\/)[^@/]*@/, '$1') // user:pass@ 제거
  s = s.split('#')[0].split('?')[0]     // 쿼리·프래그먼트 제거
  return s || null
}
// 증거 텍스트 내 인라인 URL의 쿼리스트링만 정리(스크립트 src 등은 경로까지 유지)
function sanitizeEvidence(e) {
  return String(e || '').replace(/\?[^\s"'<>]*/g, '')
}

// 5b) issue type 상세(권고문) — 활성 distinct type에만 소량 호출
export async function getIssueTypeDetail(type) {
  const r = await get(`/metadata/issue-types/${encodeURIComponent(type)}`)
  if (!r.ok) return { ok: false, error: r.error }
  const d = r.data || {}
  return {
    ok: true,
    key: type,
    title: d.title ?? d.name ?? null,
    shortDescription: d.short_description ?? null,
    description: d.long_description ?? d.description ?? d.summary ?? null,
    recommendation: d.recommendation ?? d.recommendations ?? d.remediation ?? d.recommendation_text ?? null,
    factor: d.factor ?? null,
    severity: d.severity ?? null
  }
}

// 5) 도메인 전체 수집 오케스트레이션 (factors-first → active-issues 배치 → 정규화 [→ 권고 보강])
export async function collectRiskFindingsForDomain(domain, { batchSize = 10, enrich = false } = {}) {
  const catalog = await getIssueTypeCatalog()
  if (!catalog.ok) return { ok: false, error: catalog.error }
  const factorMeta = await getFactorMetadataCatalog()
  const metadataCache = { issueTypes: catalog.cacheHit ? 'hit' : 'miss', factors: factorMeta.cacheHit ? 'hit' : 'miss' }

  const enc = encodeURIComponent(domain)
  const summary = await get(`/companies/${enc}`)
  const scorecardId = summary.ok ? summary.data?.uuid ?? summary.data?.id ?? null : null
  const score = summary.ok ? summary.data?.score ?? null : null
  const grade = summary.ok ? summary.data?.grade ?? null : null

  const active = await getActiveIssueTypesForDomain(domain)
  if (!active.ok) return { ok: false, error: active.error }
  const typeKeys = active.types.map((t) => t.type)
  const typeFactor = Object.fromEntries(active.types.map((t) => [t.type, t.factor]))
  const typeSeverity = Object.fromEntries(active.types.map((t) => [t.type, t.severity]))

  const { issueTypeResults, warnings, totalActiveIssues } = await getActiveIssuesByBatch(domain, typeKeys, { batchSize })
  const collectedAt = new Date().toISOString()
  const ctx = { domain, scorecardId, catalogByKey: catalog.byKey, typeFactor, typeSeverity, collectedAt }

  const findings = []
  for (const it of issueTypeResults) {
    const typeName = it.name
    for (const f of (Array.isArray(it.issues) ? it.issues : [])) findings.push(normalizeActiveIssue(f, typeName, ctx))
  }

  // 권고문 보강(선택): 활성 issue type만 소량 호출 — SSC 공식 recommendation/description 확보
  const recByType = {}
  if (enrich) {
    const distinct = [...new Set([...findings.map((f) => f.issue_type), ...active.types.map((t) => t.type)])]
    for (const t of distinct) {
      const dt = await getIssueTypeDetail(t)
      if (dt.ok) recByType[t] = { recommendation: clampText(dt.recommendation, 900), description: clampText(dt.shortDescription || dt.description, 500) }
      await sleep(120)
    }
    for (const f of findings) {
      const rec = recByType[f.issue_type]
      if (rec) f.recommendation_summary = summarizeText(rec.recommendation || rec.description)
    }
  }

  // 이슈 유형별 요약 (영향 점수 + SSC 공식 조치 방법) — factors.issue_summary 기반. 민감값 없음.
  const issueTypeSummary = active.types.map((t) => ({
    issue_type: t.type,
    factor: t.factor ?? catalog.byKey[t.type]?.factor ?? null,
    severity: t.severity ?? catalog.byKey[t.type]?.severity ?? null,
    count: t.count ?? null,
    score_impact: t.total_score_impact ?? null,
    ssc_recommendation: recByType[t.type]?.recommendation ?? null,
    ssc_description: recByType[t.type]?.description ?? null
  }))

  return {
    ok: true,
    domain,
    scorecardId,
    score,
    grade,
    metadataCache,
    activeTypeCount: typeKeys.length,
    reportedActiveIssues: totalActiveIssues,
    findingCount: findings.length,
    issueTypeSummary,
    warnings,
    findings
  }
}

// ---------------------------------------------------------------------
// 마스킹 유틸 (route 응답 경계에서 민감값 제거)
// ---------------------------------------------------------------------
function tldOf(host) { const p = String(host || '').split('.'); return p.length > 1 ? p.slice(-1)[0] : '' }
function hostOfUrl(u) { try { return new URL(u).host } catch { return null } }
function summarizeText(t) { if (!t) return null; const s = String(t).replace(/\s+/g, ' ').trim(); return s.length > 180 ? s.slice(0, 180) + '…' : s }
function clampText(t, max = 500) { if (!t) return null; const s = String(t).replace(/[ \t]+/g, ' ').trim(); return s.length > max ? s.slice(0, max) + '…' : s }

export function maskDomain(domain) { if (!domain) return null; const t = tldOf(domain); return t ? `***.${t}` : '***' }

export function maskAsset(type, value) {
  if (!value) return null
  if (type === 'url') { const h = hostOfUrl(value); return h ? `https://***.${tldOf(h)}/…` : 'masked-url' }
  if (type === 'domain') return `***.${tldOf(value)}`
  if (type === 'ip') return 'masked-ip'
  return 'masked'
}

// 정규화 finding → 화면/문서용 (자산은 위생 처리된 실제 URL, 증거 포함, 날짜는 date-only)
export function maskFinding(f) {
  return {
    finding_id: f.finding_id || 'ssc:finding',
    issue_type: f.issue_type,
    issue_title: f.issue_title,
    factor: f.factor,
    severity: f.severity,
    status: f.status,
    asset_type: f.asset_type,
    asset_value: f.asset_value ?? null, // 위생 처리된 실제 대상(고객 자기 자산)
    evidence: Array.isArray(f.evidence) ? f.evidence : [],
    first_seen: f.first_seen ? String(f.first_seen).slice(0, 10) : null,
    last_seen: f.last_seen ? String(f.last_seen).slice(0, 10) : null,
    recommendation_summary: f.recommendation_summary ?? null
  }
}

function pickObs(obs, field) { for (const o of obs) if (o && o[field] != null) return o[field]; return null }
function summarizeObservations(obs) {
  if (!obs.length) return null
  const keys = [...new Set(obs.flatMap((o) => Object.keys(o || {})))]
  return `${obs.length} observation(s); fields: ${keys.slice(0, 6).join(', ')}`
}
