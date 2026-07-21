// =====================================================================
// SSC Partner Portal — Backend (SecurityScorecard API read-only smoke test)
// - API Token은 backend/.env 에서만 관리되며 응답/로그에 노출되지 않습니다.
// - Docker / AI Browser Agent / Playwright / DB 는 구현하지 않습니다.
// =====================================================================
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { sscGet, tokenConfigured, getBaseUrl, httpStatusForError } from './ssc.js'
import {
  normalizeSummary,
  normalizeFactors,
  normalizeIssues,
  normalizeIssueTypes,
  toFinding
} from './normalize.js'
import { runProbe, health as probeHealth } from './probe.js'
import { collectRiskFindingsForDomain, maskFinding, maskDomain, isDomainInScope, applyView } from './securityScorecardIssueCollector.js'
import * as portal from './portalStore.js'
import * as lab from './lab.js'
import { initDb, isDbEnabled } from './db.js'
import { authRouter, requireAuth, seedDefaultUser, assertAuthConfig } from './auth.js'
import { migrateAuthIfEmpty, getUserByEmail as authGetByEmail, updateUser as authUpdateUser } from './authStore.js'
import { requireAdmin, requirePerm, stampOwner, visibleTo } from './authz.js'
import { openapiSpec } from './openapi.js'
import { recordAudit, listAudit, seedAuditIfEmpty } from './auditStore.js'
import { interpret as interpretGuide } from './guideInterpret.js'
import { loadSscTokenOverride, setSscToken, clearSscToken, sscTokenStatus, loadClaudeKeyOverride, setClaudeKey, clearClaudeKey, claudeKeyStatus } from './settingsStore.js'
import { loadActiveRecipes, listRecipes, getRecipeById, addCandidate, setStaging, clearStaging, recordGate, adoptRecipe, deleteRecipe, activeRecipeIssueTypes } from './labRecipes.js'
import { getIssueTypeCatalog } from './securityScorecardIssueCollector.js'
import { buildCoverage } from './labCoverage.js'
import { classifyIssue } from './labClassifier.js'
import { compileRecipe } from './labRecipeCompiler.js'
import { validateLab } from './labValidationGate.js'
import { claudeConfigured } from './claudeClient.js'

// 라우트의 비동기 오류가 프로세스를 죽이지 않도록 안전망
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message || e))

const app = express()
// 리버스프록시(nginx) 뒤에서 실제 클라이언트 IP를 얻기 위해 X-Forwarded-For 를 신뢰.
//  - 신뢰 홉 수를 1 로 한정(무제한 신뢰는 IP 위조 허용). 우리 구성은 nginx 1단만 앞에 있음.
//  - backend 는 호스트 포트를 열지 않아 프록시를 우회한 직접 접근이 불가하므로 안전.
//  - 미설정 시 req.ip 가 프록시 컨테이너 IP 로 기록되어 감사 로그 추적성이 사라진다.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1))
app.use(express.json())
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // refresh 쿠키 전송 허용(크로스 오리진 시)
  })
)

// 최소 요청 로깅 (토큰/민감정보 로깅 금지 — 메서드/경로만)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// 기본 보안 헤더 (helmet 미사용 — 의존성 없이). CSP는 배포 시 리버스프록시(nginx)에서 SPA HTML에 적용 권장.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow') // 응답 검색 색인 차단
  // HSTS 는 리버스프록시(nginx)가 단일 소스로 소유(docker/nginx/default.conf). 헤더 중복 방지를 위해
  // 앱은 기본 미전송. nginx 없이 앱이 직접 TLS 를 종단하는 예외 배포에서만 APP_SEND_HSTS=true 로 활성.
  if (process.env.APP_SEND_HSTS === 'true') res.setHeader('Strict-Transport-Security', `max-age=${process.env.APP_HSTS_MAX_AGE || 31536000}; includeSubDomains`)
  next()
})

// 간단 인메모리 rate limiter (단일 인스턴스용 — 확장 시 Redis 등으로 대체)
function rateLimit({ windowMs = 60000, max = 60 } = {}) {
  const hits = new Map()
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`
    const now = Date.now()
    const rec = hits.get(key)
    if (!rec || now > rec.reset) { hits.set(key, { count: 1, reset: now + windowMs }); return next() }
    if (++rec.count > max) return res.status(429).json({ ok: false, errorCode: 'RATE_LIMITED', message: '요청이 많습니다. 잠시 후 다시 시도하세요.' })
    next()
  }
}

const PORT = process.env.PORT || 8787

// ── 인증 ── 프로덕션 시크릿 가드(env only, fail-fast) → 라우트(예외) + 보호 프리픽스
// (시드/이관은 start()에서 initDb 이후 실행 — DB 활성 여부 확정 후)
assertAuthConfig()
app.use('/api/auth/login', rateLimit({ windowMs: 60000, max: 10 })) // 로그인 브루트포스 방어
app.use('/api/auth', authRouter)
// 랩 아티팩트(스크린샷) 프록시 — 인증 앞에 둠(공개). <img>는 Bearer 토큰을 못 실으므로.
// 파일명은 엄격 검증(경로순회 차단), collector의 /artifacts/*.png 만 전달(고객 데이터 아님).
app.get('/api/lab/artifact', async (req, res) => {
  const file = String(req.query.file || '')
  if (!/^[A-Za-z0-9._-]+\.png$/.test(file)) return res.status(400).send('bad file')
  const base = process.env.LAB_COLLECTOR_URL || 'http://localhost:8899'
  try {
    const r = await fetch(`${base}/artifacts/${file}`)
    if (!r.ok) return res.status(404).send('not found')
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(Buffer.from(await r.arrayBuffer()))
  } catch {
    res.status(502).send('collector unreachable')
  }
})

app.use(['/api/portal', '/api/ssc', '/api/integrations', '/api/lab', '/api/guides', '/api/settings', '/api/admin'], requireAuth)

// OpenAPI 스펙 — 관리자만(비인증자에게 API 표면 노출 금지). 프론트 'API 문서' 페이지가 이 스펙을 렌더.
app.get('/api/admin/openapi.json', requireAdmin, (_req, res) => res.json(openapiSpec))

// 조치 가이드 "해석"(비기술 쉬운말) — 로컬 Ollama 생성 + 캐시. 실패 시 text:null → 프론트가 기술 why로 폴백.
app.post('/api/guides/interpret', async (req, res) => {
  const { key, name, why, text, kind, force } = req.body || {}
  try {
    const out = await interpretGuide({ key, name, why, text, kind, force })
    res.json({ ok: true, ...out })
  } catch (e) {
    res.json({ ok: false, text: null, errorCode: 'INTERPRET_FAILED', message: String(e?.message || e) })
  }
})

// SSC API 토큰 (조직 공용) — 관리자만 설정/삭제. 토큰 값은 어떤 응답에도 반환하지 않음(상태만).
app.get('/api/settings/ssc-token', requireAdmin, async (_req, res) => {
  res.json({ ok: true, status: await sscTokenStatus() })
})
app.put('/api/settings/ssc-token', requireAdmin, async (req, res) => {
  const r = await setSscToken(req.body?.token, req.user?.email)
  if (!r.ok) return res.status(400).json({ ok: false, errorCode: 'BAD_TOKEN', message: r.message || '유효한 토큰이 아닙니다.' })
  res.json({ ok: true, status: await sscTokenStatus() })
})
app.delete('/api/settings/ssc-token', requireAdmin, async (_req, res) => {
  await clearSscToken()
  res.json({ ok: true, status: await sscTokenStatus() })
})

// ── SSC AI Lab Builder (관리자 전용) — Claude 키는 원문 미노출(상태만) ──
app.get('/api/settings/claude-key', requireAdmin, async (_req, res) => res.json({ ok: true, status: await claudeKeyStatus() }))
app.put('/api/settings/claude-key', requireAdmin, async (req, res) => {
  const r = await setClaudeKey(req.body?.key, req.user?.email)
  if (!r.ok) return res.status(400).json({ ok: false, errorCode: 'BAD_KEY', message: r.message })
  res.json({ ok: true, status: await claudeKeyStatus() })
})
app.delete('/api/settings/claude-key', requireAdmin, async (_req, res) => { await clearClaudeKey(); res.json({ ok: true, status: await claudeKeyStatus() }) })

// 지원 key 집합(TEMPLATES ∪ 채택 레시피)
function supportedKeySet() {
  return new Set([...Object.values(lab.TEMPLATES).flatMap((t) => t.issueTypes.map((k) => k.toLowerCase())), ...activeRecipeIssueTypes()])
}
const slim = (e) => ({ key: e.key, title: e.title, factor: e.factor, severity: e.severity })
const compileLocks = new Set() // 동일 issueType 동시 컴파일 방지

// 커버리지 현황(SSC 전체 ↔ 지원)
app.get('/api/admin/lab-coverage', requireAdmin, async (_req, res) => {
  const cat = await getIssueTypeCatalog({ force: false })
  if (!cat?.ok) return res.status(502).json({ ok: false, errorCode: 'SSC_CATALOG_FAIL', message: 'SSC 카탈로그 조회 실패(토큰 확인)' })
  const { buckets, stale, sscTotal, toBuildCount } = buildCoverage(cat, supportedKeySet())
  res.json({
    ok: true, sscTotal,
    counts: { supported: buckets.supported.length, toBuild: toBuildCount, guideOnly: buckets.guideOnly.length, stale: stale.length },
    supported: buckets.supported.map(slim),
    toBuild: Object.fromEntries(Object.entries(buckets.toBuild).map(([c, a]) => [c, a.map(slim)])),
    guideOnly: buckets.guideOnly.map(slim),
    stale
  })
})

// 새 이슈 판정(재사용/자동빌드/확장/신규인프라/가이드전용)
app.post('/api/admin/lab-classify', requireAdmin, async (req, res) => {
  const issueType = String(req.body?.issueType || '').trim().toLowerCase()
  if (!issueType) return res.status(400).json({ ok: false, message: 'issueType이 필요합니다.' })
  const cat = await getIssueTypeCatalog({ force: false })
  const e = cat?.byKey?.[issueType]
  if (!e) return res.status(404).json({ ok: false, errorCode: 'NOT_SSC_KEY', message: 'SSC 카탈로그에 없는 issue_type' })
  const classification = classifyIssue({ key: issueType, title: e.title, factor: e.factor }, supportedKeySet())
  res.json({ ok: true, issue: slim({ ...e, key: issueType }), classification })
})

// 레시피 컴파일(Claude) — 판정이 auto_build/extend 일 때만. dedup+lock.
app.post('/api/admin/lab-recipes/compile', requireAdmin, async (req, res) => {
  const issueType = String(req.body?.issueType || '').trim().toLowerCase()
  if (!issueType) return res.status(400).json({ ok: false, message: 'issueType이 필요합니다.' })
  if (!claudeConfigured()) return res.status(400).json({ ok: false, errorCode: 'CLAUDE_NOT_CONFIGURED', message: 'Claude API 키를 먼저 설정하세요.' })
  if (compileLocks.has(issueType)) return res.status(409).json({ ok: false, errorCode: 'COMPILE_IN_PROGRESS', message: '이미 컴파일 중입니다.' })
  const cat = await getIssueTypeCatalog({ force: false })
  const e = cat?.byKey?.[issueType]
  if (!e) return res.status(404).json({ ok: false, errorCode: 'NOT_SSC_KEY', message: 'SSC 카탈로그에 없는 issue_type' })
  const classification = classifyIssue({ key: issueType, title: e.title, factor: e.factor }, supportedKeySet())
  if (!['auto_build', 'extend'].includes(classification.verdict)) {
    return res.status(400).json({ ok: false, errorCode: 'NOT_COMPILABLE', message: `판정 '${classification.verdict}' — 레시피 컴파일 대상이 아닙니다.`, classification })
  }
  compileLocks.add(issueType)
  try {
    const out = await compileRecipe({ key: issueType, title: e.title, factor: e.factor, severity: e.severity, recommendation: e.recommendation || e.description || '' }, classification)
    if (!out.ok) return res.status(422).json({ ok: false, ...out })
    const rec = await addCandidate(out.recipe, out.generator)
    res.json({ ok: true, recipe: rec, classification })
  } catch (err) {
    res.status(500).json({ ok: false, errorCode: 'COMPILE_FAILED', message: err.message })
  } finally { compileLocks.delete(issueType) }
})

// 레시피 게이트(채택 전 검증) — staging 으로 임시 해석 후 실행.
app.post('/api/admin/lab-recipes/:id/gate', requireAdmin, async (req, res) => {
  const rec = await getRecipeById(req.params.id)
  if (!rec) return res.status(404).json({ ok: false, message: '레시피 없음' })
  setStaging(rec)
  try {
    const gate = await validateLab(rec.issueType)
    await recordGate(rec.id, gate)
    res.json({ ok: true, gate })
  } catch (e) {
    res.status(500).json({ ok: false, errorCode: 'GATE_FAILED', message: e.message })
  } finally { clearStaging(rec.issueType) }
})

// 채택(immutable active) — 게이트 통과 필수.
app.post('/api/admin/lab-recipes/:id/adopt', requireAdmin, async (req, res) => {
  const r = await adoptRecipe(req.params.id)
  if (!r.ok) return res.status(400).json({ ok: false, errorCode: 'ADOPT_BLOCKED', message: r.message })
  res.json({ ok: true, recipe: r.recipe })
})

app.get('/api/admin/lab-recipes', requireAdmin, async (_req, res) => res.json({ ok: true, recipes: await listRecipes() }))
app.get('/api/admin/lab-recipes/:id', requireAdmin, async (req, res) => {
  const rec = await getRecipeById(req.params.id)
  if (!rec) return res.status(404).json({ ok: false, message: '레시피 없음' })
  res.json({ ok: true, recipe: rec })
})
app.delete('/api/admin/lab-recipes/:id', requireAdmin, async (req, res) => { await deleteRecipe(req.params.id); res.json({ ok: true }) })

// 도메인 파라미터 정규화 → SSC scorecard_identifier(호스트명)
// 스킴 / 사용자정보 / 경로·쿼리·프래그먼트 / 포트 / 후행점 제거
function cleanDomain(d) {
  let s = String(d || '').trim().toLowerCase()
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // scheme://
  s = s.replace(/^[^@/]*@/, '')                // user:pass@
  s = s.split('/')[0].split('?')[0].split('#')[0] // path/query/fragment
  s = s.replace(/:\d+$/, '')                   // :port
  s = s.replace(/\.$/, '')                     // trailing dot
  return s
}

// SSC 오류를 HTTP 상태와 함께 응답
function sendSscError(res, error) {
  return res.status(httpStatusForError(error.errorCode)).json(error)
}

// ---------------------------------------------------------------------
// 1. Health — Backend 실행 여부 + Token 설정 여부 (Token 값은 반환 금지)
// ---------------------------------------------------------------------
app.get('/api/ssc/health', (_req, res) => {
  res.json({
    ok: true,
    baseUrl: getBaseUrl(),
    tokenConfigured: tokenConfigured()
  })
})

// ---------------------------------------------------------------------
// 2. Company summary
// ---------------------------------------------------------------------
app.get('/api/ssc/company/:domain/summary', async (req, res) => {
  const domain = cleanDomain(req.params.domain)
  const r = await sscGet(`/companies/${encodeURIComponent(domain)}`)
  if (!r.ok) return sendSscError(res, r.error)
  res.json({ ok: true, domain, summary: normalizeSummary(r.data), raw: r.data })
})

// ---------------------------------------------------------------------
// 3. Factors
// ---------------------------------------------------------------------
app.get('/api/ssc/company/:domain/factors', async (req, res) => {
  const domain = cleanDomain(req.params.domain)
  const r = await sscGet(`/companies/${encodeURIComponent(domain)}/factors`)
  if (!r.ok) return sendSscError(res, r.error)
  res.json({ ok: true, domain, factors: normalizeFactors(r.data), raw: r.data })
})

// ---------------------------------------------------------------------
// 4. Issues
// ---------------------------------------------------------------------
app.get('/api/ssc/company/:domain/issues', async (req, res) => {
  const domain = cleanDomain(req.params.domain)
  const r = await sscGet(`/companies/${encodeURIComponent(domain)}/issues`)
  if (!r.ok) return sendSscError(res, r.error)
  res.json({ ok: true, domain, issues: normalizeIssues(r.data), raw: r.data })
})

// ---------------------------------------------------------------------
// 5. Metadata — issue types
// ---------------------------------------------------------------------
app.get('/api/ssc/metadata/issue-types', async (_req, res) => {
  const r = await sscGet('/metadata/issue-types')
  if (!r.ok) return sendSscError(res, r.error)
  res.json({ ok: true, issueTypes: normalizeIssueTypes(r.data), raw: r.data })
})

// ---------------------------------------------------------------------
// 6. Import Risk — summary + factors + issues → Risk Findings 통합
// ---------------------------------------------------------------------
app.post('/api/ssc/import-risk', requirePerm('findings', 'write'), async (req, res) => {
  const { customerId, customerName } = req.body || {}
  const domain = cleanDomain(req.body?.domain)
  if (!domain) {
    return res.status(400).json({ ok: false, errorCode: 'BAD_REQUEST', message: 'domain 값이 필요합니다.', details: null })
  }

  // 세 호출을 병렬 수행
  const [summaryR, factorsR, issuesR] = await Promise.all([
    sscGet(`/companies/${encodeURIComponent(domain)}`),
    sscGet(`/companies/${encodeURIComponent(domain)}/factors`),
    sscGet(`/companies/${encodeURIComponent(domain)}/issues`)
  ])

  // Risk Findings 생성은 issues 결과에 의존 → issues 실패 시 오류 반환
  if (!issuesR.ok) return sendSscError(res, issuesR.error)

  const importedAt = new Date().toISOString()
  const normIssues = normalizeIssues(issuesR.data)
  const findings = normIssues.map((it, i) => toFinding(it, i, customerName, domain, importedAt))

  // summary/factors는 실패해도 partial 허용 (경고로 표기)
  const warnings = []
  if (!summaryR.ok) warnings.push({ scope: 'summary', ...summaryR.error })
  if (!factorsR.ok) warnings.push({ scope: 'factors', ...factorsR.error })

  res.json({
    ok: true,
    customerId: customerId || null,
    customerName: customerName || null,
    domain,
    summary: summaryR.ok ? normalizeSummary(summaryR.data) : null,
    factors: factorsR.ok ? normalizeFactors(factorsR.data) : [],
    findings,
    warnings,
    // 개발 편의용 raw — 토큰/민감정보는 SSC 응답 본문에만 국한 (Authorization 헤더는 미포함)
    raw: {
      summaryRaw: summaryR.ok ? summaryR.data : null,
      factorsRaw: factorsR.ok ? factorsR.data : null,
      issuesRaw: issuesR.data
    }
  })
})

// ---------------------------------------------------------------------
// Integration Probe (연동 사전 검증 — read-only, Token 미노출)
// ---------------------------------------------------------------------
app.get('/api/integrations/securityscorecard/health', (_req, res) => {
  res.json(probeHealth())
})

app.get('/api/integrations/securityscorecard/probe', async (_req, res) => {
  const result = await runProbe()
  res.status(result.ok ? 200 : 207).json(result) // 207: 일부 경고/오류 포함 가능
})

// Risk Finding Collector (read-only, factors-first). 정규화 요약만 반환(원본/민감값 미노출).
// schemaVersion: risk-findings.v1 — Risk Findings 화면 연결 전용.
const SCHEMA_VERSION = 'risk-findings.v1'
const VALID_SEVERITY = ['critical', 'high', 'medium', 'low', 'info']

function parseListParam(v, allowed) {
  if (!v) return null
  const arr = String(v).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const filtered = allowed ? arr.filter((x) => allowed.includes(x)) : arr
  return filtered.length ? filtered : null
}

app.get('/api/integrations/securityscorecard/risk-findings/collect', rateLimit({ windowMs: 60000, max: 20 }), async (req, res) => {
  const domain = cleanDomain(req.query.domain)
  const base = { ok: false, schemaVersion: SCHEMA_VERSION, source: 'securityscorecard', collectionMode: 'factors-first', domain: maskDomain(domain) || null }
  if (!domain) {
    return res.status(400).json({ ...base, errorCode: 'BAD_REQUEST', message: 'domain 쿼리 파라미터가 필요합니다.', findings: [], warnings: [], errors: [{ errorCode: 'BAD_REQUEST', message: 'domain required' }] })
  }

  // 파라미터
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100)
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
  const severity = parseListParam(req.query.severity, VALID_SEVERITY)
  const factor = parseListParam(req.query.factor, null)
  const includeInfo = String(req.query.includeInfo ?? 'true').toLowerCase() !== 'false'

  // 1) Scope guard (임의 도메인 차단)
  const scope = await isDomainInScope(domain)
  if (!scope.ok) {
    const http = scope.errorCode === 'SSC_TOKEN_MISSING' ? 500 : scope.errorCode === 'SSC_RATE_LIMITED' ? 429 : 502
    return res.status(http).json({ ...base, errorCode: scope.errorCode, message: scope.message || 'scope check failed', findings: [], warnings: [], errors: [{ errorCode: scope.errorCode }] })
  }
  if (!scope.inScope) {
    return res.status(200).json({ ...base, errorCode: 'SSC_SCOPE_DENIED', message: 'The requested domain is not available in the current SSC portfolio scope.', findings: [], warnings: [], errors: [{ errorCode: 'SSC_SCOPE_DENIED' }] })
  }

  // 2) 수집
  const r = await collectRiskFindingsForDomain(domain, { batchSize: 10, enrich: true })
  if (!r.ok) {
    const code = r.error?.errorCode || 'SSC_ERROR'
    const http = code === 'SSC_TOKEN_MISSING' ? 500 : 200
    return res.status(http).json({ ...base, errorCode: code, message: r.error?.message || 'collection failed', findings: [], warnings: [], errors: [{ errorCode: code }] })
  }

  // 3) 필터/정렬/페이지네이션 → 마스킹
  const view = applyView(r.findings, { severity, factor, includeInfo, limit, offset })
  const findings = view.page.map(maskFinding)

  res.json({
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    source: 'securityscorecard',
    collectionMode: 'factors-first',
    domain: maskDomain(domain),
    metadataCache: r.metadataCache || { issueTypes: 'miss', factors: 'miss' },
    summary: {
      score: r.score ?? null,
      grade: r.grade ?? null,
      activeIssueTypeCount: r.activeTypeCount,
      reportedActiveIssues: r.reportedActiveIssues,
      totalNormalizedFindingCount: view.total,
      returnedCount: view.returnedCount,
      limit,
      offset,
      hasMore: view.hasMore,
      nextOffset: view.nextOffset
    },
    filters: { severity: severity || VALID_SEVERITY, factor: factor || null, includeInfo },
    issueTypeSummary: r.issueTypeSummary || [],
    findings,
    warnings: r.warnings || [],
    errors: []
  })
})

// ---------------------------------------------------------------------
// Portal Store (포털 자체 데이터 CRUD) — 소유권(RBAC): 관리자=전체 / 비관리자=자기 것만
// ---------------------------------------------------------------------
// 단건 소유권 확인 후 mutate. 없으면 404, 권한 없으면 403.
// 존재 확인만 — 쓰기 권한은 라우트의 requirePerm(resource, 'write')가 통제(역할 기반 공유 모델).
async function guardMutate(req, res, list, id) {
  const rec = (await list).find((x) => x.id === id)
  if (!rec) { res.status(404).json({ ok: false, message: 'not found' }); return null }
  return rec
}

// 감사 기록 헬퍼 — 요청자(행위자/역할/IP)를 감사 로그에 남김(비차단).
const auditReq = (req, kind, action, target, result) => recordAudit({ kind, actor: req.user?.email || 'anon', role: req.user?.role || null, action, target, result, ip: req.ip })
// 증적 팩 수정 액션명 — 패치 키로 의미화(전달 포함/제외 등)
const evidenceAction = (patch) => {
  if (patch && 'excluded' in patch) return patch.excluded ? '증적 전달에서 제외' : '증적 고객 전달 포함'
  if (patch && patch.shareToken === null) return '증적 게시 링크 폐기'
  if (patch && patch.shareToken) return '증적 게시 링크 발급'
  return '증적 팩 수정'
}

// 감사 로그 조회(관리자 전용) — kind(all/user/system/security) 필터 + 페이지네이션
app.get('/api/audit', requireAuth, requireAdmin, async (req, res) => {
  const r = await listAudit({ kind: req.query.kind, limit: req.query.limit, offset: req.query.offset })
  res.json({ ok: true, ...r })
})

app.get('/api/portal/customers', async (req, res) => res.json({ ok: true, customers: visibleTo(req, await portal.getCustomers()) }))
app.post('/api/portal/customers', requirePerm('customers', 'write'), async (req, res) => {
  const c = await portal.addCustomer(stampOwner(req, req.body || {}))
  auditReq(req, 'user', '고객사 등록', c?.name || c?.id, 'Created')
  res.json({ ok: true, customer: c })
})
app.put('/api/portal/customers/:id', requirePerm('customers', 'write'), async (req, res) => {
  if (!(await guardMutate(req, res, portal.getCustomers(), req.params.id))) return
  const c = await portal.updateCustomer(req.params.id, req.body || {})
  auditReq(req, 'user', '고객사 수정', c?.name || req.params.id, 'Updated')
  res.json({ ok: true, customer: c })
})
app.delete('/api/portal/customers/:id', requirePerm('customers', 'write'), async (req, res) => {
  const rec = await guardMutate(req, res, portal.getCustomers(), req.params.id)
  if (!rec) return
  await portal.deleteCustomer(req.params.id)
  auditReq(req, 'user', '고객사 삭제', rec?.name || req.params.id, 'Deleted')
  res.json({ ok: true })
})

app.get('/api/portal/domains', async (req, res) => res.json({ ok: true, domains: visibleTo(req, await portal.getDomains()) }))
app.post('/api/portal/domains', requirePerm('domains', 'write'), async (req, res) => {
  const d = await portal.addDomain(stampOwner(req, req.body || {}))
  auditReq(req, 'user', '도메인 등록', d?.serviceEndpoint || d?.primary || d?.id, 'Created')
  res.json({ ok: true, domain: d })
})
app.put('/api/portal/domains/:id', requirePerm('domains', 'write'), async (req, res) => {
  if (!(await guardMutate(req, res, portal.getDomains(), req.params.id))) return
  const d = await portal.updateDomain(req.params.id, req.body || {})
  auditReq(req, 'user', '도메인 수정', d?.serviceEndpoint || d?.primary || req.params.id, 'Updated')
  res.json({ ok: true, domain: d })
})
app.delete('/api/portal/domains/:id', requirePerm('domains', 'write'), async (req, res) => {
  const rec = await guardMutate(req, res, portal.getDomains(), req.params.id)
  if (!rec) return
  await portal.deleteDomain(req.params.id)
  auditReq(req, 'user', '도메인 제거', rec?.serviceEndpoint || rec?.primary || req.params.id, 'Deleted')
  res.json({ ok: true })
})

/**
 * @openapi
 * /api/portal/evidence-packs:
 *   get:
 *     tags: [portal]
 *     summary: 증적 팩 목록 (역할별 가시성 필터 적용)
 *     responses:
 *       200: { description: 증적 팩 목록, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, evidencePacks: { type: array, items: { $ref: '#/components/schemas/EvidencePack' } } } } } } }
 *   post:
 *     tags: [portal]
 *     summary: 증적 팩 생성/업서트 (권한 evidence:write)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/EvidencePack' }
 *     responses:
 *       200: { description: 생성된 팩, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, evidencePack: { $ref: '#/components/schemas/EvidencePack' } } } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
app.get('/api/portal/evidence-packs', async (req, res) => res.json({ ok: true, evidencePacks: visibleTo(req, await portal.getEvidencePacks()) }))
app.post('/api/portal/evidence-packs', requirePerm('evidence', 'write'), async (req, res) => {
  const p = await portal.addEvidencePack(stampOwner(req, req.body || {}))
  auditReq(req, 'user', '증적 팩 생성', p?.title || p?.id, 'Created')
  res.json({ ok: true, evidencePack: p })
})
/**
 * @openapi
 * /api/portal/evidence-packs/{id}:
 *   put:
 *     tags: [portal]
 *     summary: 증적 팩 수정 (권한 evidence:write · 소유권 확인)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/EvidencePack' }
 *     responses:
 *       200: { description: 수정된 팩, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, evidencePack: { $ref: '#/components/schemas/EvidencePack' } } } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   delete:
 *     tags: [portal]
 *     summary: 증적 팩 삭제 (권한 evidence:write · 소유권 확인)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: 삭제 완료, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean } } } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
app.put('/api/portal/evidence-packs/:id', requirePerm('evidence', 'write'), async (req, res) => {
  if (!(await guardMutate(req, res, portal.getEvidencePacks(), req.params.id))) return
  const p = await portal.updateEvidencePack(req.params.id, req.body || {})
  auditReq(req, 'user', evidenceAction(req.body), p?.title || req.params.id, 'Updated')
  res.json({ ok: true, evidencePack: p })
})
app.delete('/api/portal/evidence-packs/:id', requirePerm('evidence', 'write'), async (req, res) => {
  const rec = await guardMutate(req, res, portal.getEvidencePacks(), req.params.id)
  if (!rec) return
  await portal.deleteEvidencePack(req.params.id)
  auditReq(req, 'user', '증적 팩 삭제', rec?.title || req.params.id, 'Deleted')
  res.json({ ok: true })
})

// 공개(무인증) 게시 라우트 — 발행된 팩 1건만 토큰으로 제공.
// 로그인 도입 시 인증 미들웨어는 /api/portal/* 에만 적용하고 /api/public/* 는 열어둔다.
app.get('/api/public/shared/:token', rateLimit({ windowMs: 60000, max: 30 }), async (req, res) => {
  const token = req.params.token
  if (!token) return res.status(400).json({ ok: false, message: 'token required' })
  const packs = await portal.getEvidencePacks()
  const pack = (packs || []).find((p) => p.shareToken === token && p.publish === '발행됨')
  if (!pack) return res.status(404).json({ ok: false, message: 'shared pack not found or not published' })
  // 만료 링크 차단 (폐기·기간 만료)
  if (pack.shareExpiresAt && Date.now() > Date.parse(pack.shareExpiresAt)) return res.status(410).json({ ok: false, errorCode: 'LINK_EXPIRED', message: '만료된 링크입니다.' })
  // 조회 = 고객 열람으로 간주 (공개 뷰는 별도 write 불필요)
  if (pack.customerViewed !== '열람') portal.updateEvidencePack(pack.id, { customerViewed: '열람' }).catch(() => {})
  res.json({ ok: true, pack })
})

// ---------------------------------------------------------------------
// Validation Sandbox (Partner Lab PoC) — 참고용 증적 생성 (수집기: simulated|docker)
// ---------------------------------------------------------------------
/**
 * @openapi
 * /api/lab/templates:
 *   get:
 *     tags: [lab]
 *     summary: 검증랩 지원 issue_type 목록
 *     responses:
 *       200: { description: 지원 항목, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, templates: { type: array, items: { type: string } } } } } } }
 */
app.get('/api/lab/templates', (_req, res) => res.json({ ok: true, templates: lab.supportedIssueTypes() }))
/**
 * @openapi
 * /api/lab/runs:
 *   get:
 *     tags: [lab]
 *     summary: 검증랩 재현 실행 기록 목록 (최신순)
 *     responses:
 *       200: { description: 실행 기록, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, runs: { type: array, items: { $ref: '#/components/schemas/LabRun' } } } } } } }
 */
app.get('/api/lab/runs', async (_req, res) => res.json({ ok: true, runs: await lab.getRuns() }))
/**
 * @openapi
 * /api/lab/runs/{id}:
 *   get:
 *     tags: [lab]
 *     summary: 실행 기록 단건 조회
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: RUN-AB12CD34
 *     responses:
 *       200: { description: 실행 기록, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, run: { $ref: '#/components/schemas/LabRun' } } } } } }
 *       404: { description: 없음, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
app.get('/api/lab/runs/:id', async (req, res) => {
  const run = await lab.getRun(req.params.id)
  if (!run) return res.status(404).json({ ok: false, message: 'run not found' })
  res.json({ ok: true, run })
})
/**
 * @openapi
 * /api/lab/runs:
 *   post:
 *     tags: [lab]
 *     summary: 검증랩 재현 실행 (조치 전/후 증적 생성)
 *     description: 'issueType 에 해당하는 취약↔조치 타깃을 실제 재현해 증적을 만든다. 권한 labs:write 필요.'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [issueType]
 *             properties:
 *               issueType: { type: string, example: hsts_incorrect_v2 }
 *               customer: { type: string, nullable: true, example: demo-commerce }
 *               domain: { type: string, nullable: true, example: demo-commerce.example.com }
 *               serviceEndpoint: { type: string, nullable: true }
 *               accessUrl: { type: string, nullable: true }
 *     responses:
 *       200: { description: 실행 결과, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, run: { $ref: '#/components/schemas/LabRun' } } } } } }
 *       400: { description: issueType 누락, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
app.post('/api/lab/runs', requirePerm('labs', 'write'), async (req, res) => {
  const issueType = String(req.body?.issueType || '').trim()
  if (!issueType) return res.status(400).json({ ok: false, errorCode: 'BAD_REQUEST', message: 'issueType이 필요합니다.' })
  const run = await lab.runLab({
    issueType,
    findingRef: req.body?.findingRef || null,
    customer: req.body?.customer || null,
    domain: req.body?.domain ? cleanDomain(req.body.domain) : null,
    serviceEndpoint: req.body?.serviceEndpoint || null,
    accessUrl: req.body?.accessUrl || null,
    sscLookupDomain: req.body?.sscLookupDomain || (req.body?.domain ? cleanDomain(req.body.domain) : null)
  })
  auditReq(req, 'user', '검증랩 재현 실행', `${issueType} · ${run?.serviceEndpoint || run?.sscLookupDomain || '—'}`, run?.status === 'succeeded' ? 'Success' : (run?.status || 'Run'))
  res.json({ ok: true, run })
})
// 참고용 PoC run 정리(누적 테스트/중복 삭제) — 관리자 전용.
app.post('/api/lab/runs/delete', requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  if (!ids.length) return res.status(400).json({ ok: false, errorCode: 'BAD_REQUEST', message: '삭제할 ids가 필요합니다.' })
  const deleted = await lab.deleteRuns(ids)
  res.json({ ok: true, deleted })
})
/**
 * @openapi
 * /api/lab/runs/{id}:
 *   delete:
 *     tags: [lab]
 *     summary: 실행 기록 삭제 (관리자 전용)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: 삭제 건수, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, deleted: { type: integer, example: 1 } } } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
app.delete('/api/lab/runs/:id', requireAdmin, async (req, res) => {
  const deleted = await lab.deleteRuns([req.params.id])
  res.json({ ok: true, deleted })
})

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', message: '알 수 없는 엔드포인트입니다.', details: null })
})

// 시드 관리자 승격 + 기존 레코드 소유권 backfill (멱등 — 기존 데이터를 관리자 소유로)
async function backfillOwnership() {
  const seedEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@ssc.local').toLowerCase()
  const admin = await authGetByEmail(seedEmail)
  if (!admin) return
  if (admin.role !== 'admin') { await authUpdateUser(admin.id, { role: 'admin' }); console.log('[authz] 시드 계정 admin 승격') }
  let n = 0
  const pairs = [[portal.getCustomers, portal.updateCustomer], [portal.getDomains, portal.updateDomain], [portal.getEvidencePacks, portal.updateEvidencePack]]
  for (const [getList, upd] of pairs) {
    for (const rec of await getList()) if (rec && !rec.ownerId) { await upd(rec.id, { ownerId: admin.id }); n++ }
  }
  if (n) console.log(`[authz] 소유권 backfill — ${n}건 → ${seedEmail}`)
}

async function start() {
  await initDb()
  await loadSscTokenOverride() // 관리자 설정 SSC 토큰을 메모리로 로드(있으면 env보다 우선)
  await loadClaudeKeyOverride() // 관리자 설정 Claude 키 로드(있으면 env보다 우선)
  if (isDbEnabled()) { await portal.migratePortalIfEmpty(); await migrateAuthIfEmpty() }
  await seedDefaultUser() // 기본 사용자 시드(파일/DB 확정 후)
  await backfillOwnership() // 시드 admin 승격 + 기존 레코드 소유권 backfill(멱등)
  await loadActiveRecipes() // 채택된 AI Lab Builder 레시피를 메모리로 로드(mapIssueType 동기 조회용)
  await seedAuditIfEmpty() // 감사 로그 최초 시드(비어있을 때만)
  // 시스템 이벤트: 시작 시 지속성 모드 기록(Postgres 미연결 시 파일 폴백을 감사로 남김)
  recordAudit({ kind: 'system', actor: 'system', role: 'system', action: '서버 시작 · 지속성 모드', target: isDbEnabled() ? 'PostgreSQL' : '파일 저장소 폴백(Postgres 미연결)', result: isDbEnabled() ? 'PostgreSQL' : 'Fallback' })
  app.listen(PORT, () => {
    console.log(`SSC backend listening on http://localhost:${PORT}`)
    console.log(`  baseUrl        : ${getBaseUrl()}`)
    console.log(`  tokenConfigured: ${tokenConfigured()}`)
    console.log(`  persistence    : ${isDbEnabled() ? 'PostgreSQL' : 'file store'}`)
  })
}
start()
