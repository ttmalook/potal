// =====================================================================
// SSC Web-Engine Probe — SSC API가 웹 엔진/기술 정보를 주는지 실측
//  실행: cd backend && node scripts/sscEngineProbe.mjs [domain]
//  목적: active-issues 원시 응답 + 부가 엔드포인트에서 server/nginx/apache/iis/
//        product/cpe/technology 신호가 실제로 오는지 확인 → 자동/수동 선택 설계 근거.
// =====================================================================
import { get } from '../src/securityScorecardClient.js'
import { getIssueTypeCatalog } from '../src/securityScorecardIssueCollector.js'

const DOMAIN = process.argv[2] || process.env.SSC_TEST_DOMAIN || 'gateway.example.com'
const enc = encodeURIComponent(DOMAIN)
const ENGINE_RE = /nginx|apache|microsoft-iis|\biis\b|tomcat|weblogic|websphere|jetty|litespeed|openresty|cloudflare|akamai|fastly|\bwaf\b|\bcpe:|product|technolog|server\b|x-powered-by|banner/i

function scan(obj, path = '', hits = []) {
  if (obj == null) return hits
  if (typeof obj === 'string') { if (ENGINE_RE.test(obj)) hits.push(`${path} = ${obj.slice(0, 140)}`); return hits }
  if (typeof obj !== 'object') return hits
  for (const [k, v] of Object.entries(obj)) {
    if (ENGINE_RE.test(k)) hits.push(`${path}.${k} (key) → ${JSON.stringify(v).slice(0, 120)}`)
    scan(v, path ? `${path}.${k}` : k, hits)
  }
  return hits
}

async function tryEndpoint(label, path) {
  const r = await get(path)
  const status = r.status ?? (r.ok ? 200 : '?')
  if (!r.ok) { console.log(`  ✗ ${label.padEnd(28)} [${status}] ${r.error?.errorCode || r.error?.message || ''}`); return null }
  console.log(`  ✓ ${label.padEnd(28)} [${status}] keys: ${Object.keys(r.data || {}).slice(0, 12).join(', ')}`)
  return r.data
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(` SSC 웹 엔진 정보 실측 — domain: ${DOMAIN}`)
  console.log('═══════════════════════════════════════════════════════════════')

  console.log('\n── 1) 부가 엔드포인트 존재/구조 ──')
  const summary = await tryEndpoint('company summary', `/companies/${enc}`)
  await tryEndpoint('services (digital footprint)', `/companies/${enc}/services`)
  await tryEndpoint('information (assets)', `/companies/${enc}/information`)
  await tryEndpoint('history/technologies', `/companies/${enc}/technologies`)
  if (summary) {
    const s = summary
    console.log('   company summary 관심 필드:', JSON.stringify({ industry: s.industry, products: s.products, tags: s.tags, description: (s.description || '').slice(0, 60) }))
  }

  console.log('\n── 2) active-issues 원시 응답에서 엔진 신호 스캔 (배치=8) ──')
  const cat = await getIssueTypeCatalog({ force: true })
  const probeTypes = (cat.keys || []).filter((k) => /header|hsts|csp|cookie|x_|server|patch|cve|product|service_|version|redirect|tls|cert|nginx|apache|iis|http/i.test(k))
  const its = []
  let totalIssues = 0
  for (let i = 0; i < probeTypes.length; i += 8) {
    const qp = new URLSearchParams()
    probeTypes.slice(i, i + 8).forEach((k) => qp.append('issue_types', k))
    const r = await get(`/companies/${enc}/active-issues?${qp.toString()}`)
    if (!r.ok) continue
    const d = r.data || {}
    if (d.error) continue
    if (typeof d.total_active_issues === 'number') totalIssues += d.total_active_issues
    for (const t of (Array.isArray(d.issue_types) ? d.issue_types : [])) its.push(t)
    await new Promise((s) => setTimeout(s, 120))
  }
  console.log(`  조회 issue_types(활성): ${its.length}, total_active_issues 합: ${totalIssues}`)
  console.log(`  활성 타입: ${its.map((t) => t.type || t.name).slice(0, 30).join(', ')}`)

  // 첫 finding 하나의 전체 필드 구조 출력 (엔진 필드가 어디 숨어있는지 확인)
  const sampleFinding = its.flatMap((t) => (t.issues || []).map((f) => ({ type: t.type || t.name, f }))).find(Boolean)
  if (sampleFinding) {
    console.log(`\n  샘플 finding 필드(type=${sampleFinding.type}):`, Object.keys(sampleFinding.f).join(', '))
    const obs = sampleFinding.f.observations?.[0]
    if (obs) console.log('  observation[0] 필드:', Object.keys(obs).join(', '))
  }
  // evidence 텍스트 샘플(여기 Server: 헤더가 들어감) — 앞 8개
  const evTexts = its.flatMap((t) => (t.issues || []).flatMap((f) => (f.observations || []).flatMap((o) => o.evidence || [])))
  console.log(`\n  evidence 텍스트 총 ${evTexts.length}건, 샘플:`)
  ;[...new Set(evTexts)].slice(0, 8).forEach((e) => console.log('   › ' + String(e).slice(0, 120)))

  const hits = scan(its, 'issue_types')
  console.log(`\n  엔진/기술 신호 매치(목록): ${hits.length}건`)
  ;[...new Set(hits)].slice(0, 20).forEach((h) => console.log('   • ' + h))

  console.log('\n── 3) 이슈 타입별 상세 findings — 제품/엔진/CPE 확인 ──')
  const activeTypes = its.map((t) => t.type || t.name).filter(Boolean)
  // 엔진/제품 신호가 나올 만한 타입 우선
  const detailTypes = activeTypes.filter((t) => /redirect|http|patch|vuln|cve|log4j|end_of_service|service_ftp|service_http|tlscert/i.test(t)).slice(0, 6)
  for (const t of detailTypes) {
    const r = await get(`/companies/${enc}/issues/${encodeURIComponent(t)}`)
    if (!r.ok) { console.log(`  ✗ issues/${t} [${r.status}] ${r.error?.errorCode || ''}`); continue }
    const arr = Array.isArray(r.data?.entries) ? r.data.entries : Array.isArray(r.data) ? r.data : (r.data?.issues || [])
    const f0 = arr[0]
    if (!f0) { console.log(`  · ${t}: findings 0`); continue }
    console.log(`  · ${t}: ${arr.length}건, finding 필드: ${Object.keys(f0).join(', ')}`)
    const dhits = [...new Set(scan(arr.slice(0, 5), t))]
    dhits.slice(0, 8).forEach((h) => console.log('      ⚑ ' + h))
    await new Promise((s) => setTimeout(s, 120))
  }
  console.log('\n── 결론 힌트 ──')
  console.log('  · 위 ⚑ 에 nginx/apache/iis/cpe/product/버전 이 실제로 나오면 → 자동 선택 근거 있음')
  console.log('  · 안 나오면 → 웹 엔진 확정 정보 없음 → 수동 선택(탭) 기본 + 있으면 보조')
}

main().catch((e) => { console.error('probe 실패:', e.message); process.exit(1) })
