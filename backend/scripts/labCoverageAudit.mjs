// =====================================================================
// Lab Coverage Audit — SSC 전체 issue_type ↔ 검증랩 지원 현황 대조
//  실행:  cd backend && node scripts/labCoverageAudit.mjs   (또는 --json)
//  목적:  "앞으로 만들어야 할 랩이 정확히 무엇인지"를 유한한 목록으로 산출.
//    ✓ supported     : 이미 랩 템플릿 있음 (lab.js TEMPLATES)
//    [TODO] to-build      : 표준 랩으로 재현 가능해 보이는데 아직 템플릿 없음 (= 만들 목록)
//    [GUIDE] guide-only    : 인프라 랩으로 재현 불가(유출/침해/패치지연 등) → 가이드만
//    주의: stale         : 우리가 지원한다고 적었지만 SSC 카탈로그에 없는 key
//  주의: 재현 가능 여부는 '휴리스틱' 1차 분류. 최종 채택은 제작 표준으로 사람이 확인.
// =====================================================================
import { getIssueTypeCatalog } from '../src/securityScorecardIssueCollector.js'
import { TEMPLATES } from '../src/lab.js'
import { buildCoverage } from '../src/labCoverage.js'

const JSON_OUT = process.argv.includes('--json')

// 우리가 실제로 랩으로 재현하는 key (TEMPLATES 기준 — CLI 는 정적 코드 감사).
//  채택 레시피는 관리자 API(/api/admin/lab-coverage)에서 합산 반영.
const SUPPORTED = new Set(Object.values(TEMPLATES).flatMap((t) => t.issueTypes.map((k) => k.toLowerCase())))

function main(cat) {
  if (!cat.ok) {
    console.error('✗ SSC 카탈로그 조회 실패:', cat.error?.errorCode || cat.error?.message || 'unknown')
    console.error('   backend/.env 의 SSC 토큰 확인 후 backend 디렉터리에서 실행하세요.')
    process.exit(1)
  }
  const all = Object.values(cat.byKey) // {key, factor, severity, title}
  const { buckets, stale } = buildCoverage(cat, SUPPORTED)

  const toBuildCount = Object.values(buckets.toBuild).reduce((n, a) => n + a.length, 0)

  if (JSON_OUT) {
    console.log(JSON.stringify({
      sscTotal: all.length,
      supported: buckets.supported.map((e) => e.key),
      toBuild: Object.fromEntries(Object.entries(buckets.toBuild).map(([c, a]) => [c, a.map((e) => e.key)])),
      guideOnlyCount: buckets.guideOnly.length,
      stale
    }, null, 2))
    return
  }

  const line = (e) => `    - ${e.key.padEnd(42)} [${e.factor || '?'} · ${e.severity || '?'}] ${e.title || ''}`
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(' 검증랩 커버리지 감사 (SSC /metadata/issue-types 대조)')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`SSC 전체 issue_type      : ${all.length}`)
  console.log(`✓ 이미 지원(랩 있음)     : ${buckets.supported.length}`)
  console.log(`[TODO] 재현 가능·미구축(만들 목록): ${toBuildCount}`)
  console.log(`   · http_header : ${buckets.toBuild.http_header.length}`)
  console.log(`   · tls         : ${buckets.toBuild.tls.length}`)
  console.log(`   · dns         : ${buckets.toBuild.dns.length}`)
  console.log(`   · network     : ${buckets.toBuild.network.length}`)
  console.log(`[GUIDE] 가이드-only(재현 불가) : ${buckets.guideOnly.length}`)
  if (stale.length) console.log(`주의: 우리 지원목록에만 있음(SSC 없음): ${stale.length} → ${stale.join(', ')}`)
  console.log('')
  console.log('─── [TODO] 만들 목록 (재현 가능해 보이나 아직 템플릿 없음) ───')
  for (const c of ['http_header', 'tls', 'dns', 'network']) {
    const arr = buckets.toBuild[c].sort((a, b) => String(a.key).localeCompare(String(b.key)))
    if (!arr.length) continue
    console.log(`  [${c}] ${arr.length}건`)
    arr.forEach((e) => console.log(line(e)))
  }
  console.log('')
  console.log('─── ✓ 이미 지원 ───')
  buckets.supported.sort((a, b) => String(a.key).localeCompare(String(b.key))).forEach((e) => console.log(line(e)))
  console.log('')
  console.log(`([GUIDE] 가이드-only ${buckets.guideOnly.length}건은 유출/침해/패치지연 등 인프라 랩으로 재현 불가 → --json 으로 전체 확인)`)
}

getIssueTypeCatalog({ force: true }).then(main).catch((e) => { console.error('audit 실패:', e.message); process.exit(1) })
