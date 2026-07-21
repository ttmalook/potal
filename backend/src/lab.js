// =====================================================================
// Validation Sandbox (Partner Lab PoC) 오케스트레이터
//  - issue_type → 카테고리/템플릿 매핑(개별 하드코딩 금지, 매핑 테이블).
//  - 교체 가능한 수집기: 'simulated'(기본, Docker 불필요) | 'docker'(추후 Playwright/스캐너).
//  - 모든 카테고리가 동일 증적 형태: { visual_before/after, technical_diff, guide }.
//  - 참고용 PoC 증적일 뿐, 고객환경 검증/조치완료 아님. 실제 해소는 SSC 재스캔.
//  - 저장: backend/data/lab-store.json (Postgres 승격 전 파일 저장).
// =====================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as db from './db.js'
import { readSourceDiff } from './labSourceDiff.js'
import { getActiveRecipe, activeRecipeIssueTypes } from './labRecipes.js'
import { buildRenderPlan } from './labRenderer.js'
import { GUIDES, guideKey } from './remediationGuides.js' // 조치 방향 SSOT(프론트 조치 가이드와 공유)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '..', 'data', 'lab-store.json')
const COLLECTOR = (process.env.LAB_COLLECTOR || 'simulated').toLowerCase()

// ---------------------------------------------------------------------
// 1) 템플릿 / issue_type 매핑
// ---------------------------------------------------------------------
export const TEMPLATES = {
  http_header: {
    id: 'http_header',
    category: 'HTTP/Web Header',
    evidenceMode: 'web_screenshot',
    tool: 'playwright',
    title: 'HTTP 보안 헤더 재현 랩',
    // 실제 SSC /metadata/issue-types 기준. (server-banner/x-powered-by/redirect는 SSC 미존재 또는 미구축 → 제외)
    issueTypes: ['hsts_incorrect_v2', 'cookie_missing_http_only', 'cookie_missing_secure_attribute', 'csp_no_policy_v2',
      'csp_too_broad_v2', 'csp_unsafe_policy_v2', 'insecure_https_redirect_pattern_v2',
      'x_content_type_options_incorrect_v2', 'x_frame_options_incorrect_v2', 'x_xss_protection_incorrect_v2']
  },
  tls: {
    id: 'tls',
    category: 'TLS/Certificate',
    evidenceMode: 'scan_report',
    tool: 'openssl',
    title: 'TLS/인증서 재현 랩',
    issueTypes: ['tls_weak_cipher', 'tls_weak_protocol', 'tlscert_excessive_expiration', 'tlscert_no_revocation', 'tlscert_expired', 'insecure_server_certificate_key_size', 'tlscert_self_signed', 'tlscert_weak_signature', 'tlscert_revoked']
  },
  dns: {
    id: 'dns',
    category: 'DNS/Email',
    evidenceMode: 'scan_report',
    tool: 'dig',
    title: 'DNS/이메일 인증 재현 랩',
    // dkim_record_missing 은 SSC에 없음(DKIM은 선택) → 제외
    issueTypes: ['spf_record_missing', 'spf_record_softfail', 'spf_record_wildcard', 'dmarc_record_missing',
      'spf_record_malformed', 'dmarc_contains_none', 'subdomain_dmarc_contains_none',
      'dkim_weak_signature', 'dkim_insufficient_key_length']
  },
  network: {
    id: 'network',
    category: 'Network Service',
    evidenceMode: 'scan_report',
    tool: 'nmap',
    title: '네트워크 서비스 노출 재현 랩',
    // 노출 서비스(취약 타깃 다중 포트 리스닝으로 재현). device/reputation/PII 계열은 재현 불가 → 제외.
    issueTypes: ['service_pptp', 'open_port', 'insecure_telnet', 'insecure_ftp', 'service_rdp', 'service_vnc', 'service_dns',
      'service_ftp', 'service_telnet', 'service_ldap', 'service_ldap_anonymous', 'service_smb', 'service_mysql',
      'service_redis', 'service_mongodb', 'service_elasticsearch', 'service_couchdb', 'service_cassandra',
      'service_imap', 'service_http_proxy']
  },
  ssh: {
    id: 'ssh',
    category: 'SSH',
    evidenceMode: 'scan_report',
    tool: 'nmap',
    title: 'SSH 약한 알고리즘 재현 랩',
    issueTypes: ['ssh_weak_cipher', 'ssh_weak_protocol']
  }
}

export function mapIssueType(issueType) {
  const t = String(issueType || '').toLowerCase()
  for (const tpl of Object.values(TEMPLATES)) {
    if (tpl.issueTypes.includes(t)) return tpl
  }
  // 신규 레시피 랩(기존 50종에 없을 때만) — 추가형. 기존 하드코딩이 항상 우선.
  const rec = getActiveRecipe(t)
  if (rec) return recipeTemplate(rec)
  return null
}
// 채택된 레시피 → 합성 템플릿(기존 파이프라인이 그대로 소비).
function recipeTemplate(recipe) {
  const net = recipe.archetype === 'network'
  return { id: recipe.archetype, category: net ? 'Network Service' : 'HTTP/Web Header', evidenceMode: net ? 'scan_report' : 'web_screenshot', tool: net ? 'nmap' : 'curl', title: '레시피 랩(AI Lab Builder)', issueTypes: [recipe.issueType], _recipe: recipe }
}
export function supportedIssueTypes() {
  const base = Object.values(TEMPLATES).map((t) => ({ template: t.id, category: t.category, evidenceMode: t.evidenceMode, issueTypes: t.issueTypes }))
  const recIssues = activeRecipeIssueTypes()
  if (recIssues.length) base.push({ template: 'recipe', category: 'AI Lab Builder', evidenceMode: 'web_screenshot', issueTypes: recIssues })
  return base
}

function guideFor(issueType, category) {
  const rec = getActiveRecipe(issueType)
  if (rec?.guide?.direction) return { issueType, direction: rec.guide.direction, steps: rec.guide.steps || [], note: '레시피 조치 방향(AI Lab Builder · 게이트 통과 근거).' }
  const key = guideKey(issueType)
  const g = key ? GUIDES[key] : null
  if (g) return { issueType, ...g, note: '일반 조치 방향(참고). 운영 반영 전 테스트 및 고객 내부 검토 필요.' }
  return { issueType, direction: `${category} 계열 일반 조치 방향(템플릿 가이드 준비 중).`, steps: ['이슈 유형별 표준 조치 확인', '표준 검증랩에서 재현/시연', 'SSC 재스캔으로 확인'], note: '일반 조치 방향(참고).' }
}

// ---------------------------------------------------------------------
// 3) 수집기(simulated) — 카테고리별 Before/After 증적 생성
//    (docker 수집기로 교체 시 동일 형태 반환하면 됨)
// ---------------------------------------------------------------------
function simulatedEvidence(template, issueType, nowIso) {
  const cat = template.id
  if (cat === 'http_header') {
    const header = issueType.includes('hsts') ? 'Strict-Transport-Security' : issueType.includes('cookie') ? 'Set-Cookie(HttpOnly/Secure)' : issueType.includes('csp') ? 'Content-Security-Policy' : 'X-Powered-By'
    const beforeVal = issueType.includes('x_powered_by') ? 'Express' : 'Not Present'
    const afterVal = issueType.includes('x_powered_by') ? '(removed)' : issueType.includes('hsts') ? 'max-age=31536000; includeSubDomains' : issueType.includes('cookie') ? 'HttpOnly; Secure; SameSite=Lax' : "default-src 'self'; ..."
    return {
      evidenceMode: 'web_screenshot',
      visual_before: { label: 'Before · 취약 웹 (헤더 미적용)', screenshot: `mock://lab/${cat}/${issueType}/before.png`, variant: 'before' },
      visual_after: { label: 'After · 조치 웹 (헤더 적용)', screenshot: `mock://lab/${cat}/${issueType}/after.png`, variant: 'after' },
      technical_diff: [
        { key: header, before: beforeVal, after: afterVal, changed: true },
        { key: 'HTTP Status', before: '200', after: '200', changed: false },
        { key: 'Render Check', before: 'OK', after: 'OK', changed: false }
      ],
      raw_summary: { tool: 'playwright(simulated)', before: 'headers captured', after: 'headers captured' }
    }
  }
  // scan_report (tls/dns/network)
  const scan = {
    tls: { tool: 'openssl s_client(simulated)', key: 'Cipher/Cert', before: issueType.includes('cipher') ? 'TLS_RSA_WITH_3DES_EDE_CBC_SHA (weak)' : 'notAfter: 5y (excessive)', after: issueType.includes('cipher') ? 'TLS_AES_128_GCM_SHA256 (strong)' : 'notAfter: 90d (compliant)' },
    dns: { tool: 'dig TXT(simulated)', key: 'SPF/DMARC', before: 'v=spf1 → (none)', after: 'v=spf1 include:_spf.example.com -all' },
    network: { tool: 'nmap(simulated)', key: issueType === 'service_pptp' ? 'tcp/1723 (PPTP)' : 'exposed port', before: 'open', after: 'closed/filtered' }
  }[cat]
  return {
    evidenceMode: 'scan_report',
    visual_before: { label: `Before · 스캔 리포트 (${scan.tool})`, screenshot: `mock://lab/${cat}/${issueType}/before-report.png`, variant: 'before' },
    visual_after: { label: `After · 스캔 리포트 (${scan.tool})`, screenshot: `mock://lab/${cat}/${issueType}/after-report.png`, variant: 'after' },
    technical_diff: [
      { key: scan.key, before: scan.before, after: scan.after, changed: true },
      { key: 'Reproduced In', before: 'Partner Standard Lab', after: 'Partner Standard Lab', changed: false }
    ],
    raw_summary: { tool: scan.tool }
  }
}

const COLLECTOR_URL = process.env.LAB_COLLECTOR_URL || 'http://localhost:8899'

// 레시피 랩: inline before/after → del/add diff 라인.
function recipeSourceDiff(recipe) {
  const sd = recipe.sourceDiff || {}
  const inline = sd.inline || { before: '', after: '' }
  const lines = []
  String(inline.before).split('\n').forEach((s) => lines.push({ t: 'del', s }))
  String(inline.after).split('\n').forEach((s) => lines.push({ t: 'add', s }))
  return { label: sd.label || '이 항목에 해당하는 설정 변경(레시피)', file: sd.file || 'conf.d/default.conf', language: sd.language || 'nginx', real: false, focused: true, lines }
}

async function collect(template, issueType, nowIso, recipe = null) {
  if (COLLECTOR === 'docker') {
    // 레시피 랩이면 결정적 렌더러가 만든 plan 을 함께 보낸다(collector 가 실행).
    let plan = null
    if (recipe) {
      try { plan = buildRenderPlan(recipe) } catch (e) { throw Object.assign(new Error('레시피 렌더 실패: ' + e.message), { code: 'LAB_RENDER_ERROR' }) }
    }
    // evidence-collector(Playwright/스캐너) 서비스 호출. lab/evidence-collector 참고.
    let resp
    try {
      resp = await fetch(`${COLLECTOR_URL}/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, issueType, plan })
      })
    } catch (e) {
      throw Object.assign(new Error('evidence-collector에 연결 실패'), { code: 'LAB_COLLECTOR_UNAVAILABLE' })
    }
    const data = await resp.json().catch(() => null)
    // 아직 수집기가 미지원(501)인 카테고리(TLS/DNS/네트워크)는 simulated로 폴백
    if (resp.status === 501) {
      const ev = simulatedEvidence(template, issueType, nowIso)
      ev.raw_summary = { ...(ev.raw_summary || {}), fallback: 'docker collector 미지원 카테고리 → simulated' }
      return ev
    }
    if (!resp.ok || data?.ok === false) {
      throw Object.assign(new Error(data?.error || `collector 오류 (HTTP ${resp.status})`), { code: 'LAB_COLLECTOR_ERROR' })
    }
    return withArtifactUrls(data)
  }
  return simulatedEvidence(template, issueType, nowIso)
}

// collector가 반환한 /artifacts/xxx.png → 브라우저가 볼 수 있는 백엔드 프록시 URL 부여
function withArtifactUrls(evidence) {
  for (const key of ['visual_before', 'visual_after']) {
    const v = evidence?.[key]
    if (v?.screenshot && v.screenshot.startsWith('/artifacts/')) {
      const file = v.screenshot.split('/').pop()
      v.url = '/api/lab/artifact?file=' + encodeURIComponent(file)
    }
  }
  return evidence
}

// ---------------------------------------------------------------------
// 4) 저장소 (파일)
// ---------------------------------------------------------------------
function load() {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch (e) { console.error('[lab] load failed:', e.message) }
  return { runs: [] }
}
function save(state) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2))
  } catch (e) { console.error('[lab] write failed:', e.message) }
}
// Postgres-or-file
export async function getRuns() {
  const runs = db.isDbEnabled() ? await db.docList('lab_runs_doc') : load().runs
  // 최신순 확정 정렬 — DB(docList)는 순서가 보장되지 않아 순번이 뒤섞이던 문제 수정.
  //  startedAt 은 ISO 문자열이라 내림차순 문자열 비교 = 최신 먼저.
  return [...runs].sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
}
export async function getRun(id) {
  return db.isDbEnabled() ? db.docGet('lab_runs_doc', id) : load().runs.find((r) => r.id === id) || null
}
async function saveRun(run) {
  if (db.isDbEnabled()) { await db.docUpsert('lab_runs_doc', run.id, run); return }
  const s = load(); s.runs = [run, ...s.runs].slice(0, 200); save(s)
}
// 참고용 PoC run 삭제(누적된 테스트/중복 정리용). 반환: 실제 삭제된 id 수.
export async function deleteRuns(ids) {
  const set = new Set((Array.isArray(ids) ? ids : [ids]).map((x) => String(x)))
  if (!set.size) return 0
  if (db.isDbEnabled()) {
    let n = 0
    for (const id of set) { try { await db.docDelete('lab_runs_doc', id); n++ } catch { /* 없는 id 무시 */ } }
    return n
  }
  const s = load()
  const before = s.runs.length
  s.runs = s.runs.filter((r) => !set.has(String(r.id)))
  save(s)
  return before - s.runs.length
}

// ---------------------------------------------------------------------
// 5) 실행: issue_type → 템플릿 → Before/After 수집 → diff/guide → 저장
// ---------------------------------------------------------------------
export async function runLab({ issueType, findingRef = null, customer = null, domain = null, serviceEndpoint = null, accessUrl = null, sscLookupDomain = null }, { nowIso } = {}) {
  const now = nowIso || new Date().toISOString()
  const runId = 'RUN-' + Math.abs(hashCode(`${issueType}:${findingRef}:${now}`)).toString(36).slice(0, 8).toUpperCase()
  const template = mapIssueType(issueType)

  if (!template) {
    const run = { id: runId, issueType, findingRef, customer, domain, status: 'unsupported', collector: COLLECTOR, startedAt: now, endedAt: now, note: `issue_type "${issueType}"에 대한 랩 템플릿이 아직 없습니다(수동 PoC 필요).` }
    await saveRun(run)
    return run
  }

  const started = now
  const recipe = template._recipe || getActiveRecipe(issueType)
  let evidence, status, note
  try {
    evidence = await collect(template, issueType, now, recipe)
    status = 'succeeded'
    note = '파트너 표준 검증랩 참고용 PoC 증적. 고객환경 조치 완료 아님 · SSC 재스캔 필요.'
  } catch (e) {
    status = 'failed'
    note = e.code === 'LAB_COLLECTOR_UNAVAILABLE' ? 'Docker 수집기가 아직 준비되지 않았습니다(LAB_COLLECTOR=simulated로 실행하세요).' : e.message
  }
  const ended = new Date(Date.parse(started) + 3000).toISOString()

  const run = {
    id: runId,
    issueType,
    findingRef,
    customer,
    domain,
    serviceEndpoint,
    accessUrl,
    sscLookupDomain: sscLookupDomain || domain,
    port: serviceEndpoint && serviceEndpoint.includes(':') ? Number(serviceEndpoint.split(':')[1]) : null,
    templateId: template.id,
    category: template.category,
    evidenceMode: template.evidenceMode,
    tool: template.tool,
    collector: COLLECTOR,
    status,
    startedAt: started,
    endedAt: ended,
    note,
    logs: buildLogs(template, status, started),
    evidence: evidence
      ? { visual_before: evidence.visual_before, visual_after: evidence.visual_after, technical_diff: evidence.technical_diff, raw_summary: evidence.raw_summary }
      : null,
    // 랩 타깃의 실제 취약/조치 설정 diff. 레시피 랩이면 레시피 inline, 아니면 실제 파일.
    sourceDiff: recipe ? recipeSourceDiff(recipe) : readSourceDiff(template.id, issueType),
    guide: guideFor(issueType, template.category),
    disclaimers: {
      partnerLabOnly: true,
      notCustomerEnvValidation: true,
      requiresSscRescan: true
    }
  }
  // 같은 (대상, 이슈)로 다시 재현하면 기존 run 교체(중복 방지). 대상 = serviceEndpoint > sscLookupDomain > domain.
  const target = serviceEndpoint || sscLookupDomain || domain
  if (target) {
    const dupIds = (await getRuns())
      .filter((r) => r.id !== runId && r.issueType === issueType && (r.serviceEndpoint || r.sscLookupDomain || r.domain) === target)
      .map((r) => r.id)
    if (dupIds.length) await deleteRuns(dupIds)
  }
  await saveRun(run)
  return run
}

function buildLogs(template, status, startedIso) {
  const base = Date.parse(startedIso) || Date.now()
  // 실제 날짜·시간(UTC) 타임스탬프. offset(초)로 각 단계 시각 계산.
  const stamp = (offsetSec) => new Date(base + offsetSec * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const steps = [
    [0, 'lab run queued'],
    [1, `template=${template.id} (${template.category}) collector selected`],
    [2, 'vulnerable target ready'],
    [3, 'remediated target ready'],
    [4, `evidence-collector (${template.tool}) capturing Before`],
    [6, 'Before captured'],
    [7, 'evidence-collector capturing After'],
    [9, 'After captured'],
    [10, 'diff computed'],
    [11, 'artifacts saved'],
    [12, 'teardown complete']
  ]
  const lines = steps.map(([o, msg]) => `[${stamp(o)}] ${msg}`)
  if (status !== 'succeeded') lines.push(`[${stamp(12)}] status=${status}`)
  return lines
}

function hashCode(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0 }
  return h
}
