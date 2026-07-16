// =====================================================================
// Lab Validation Gate CLI — 랩이 표준 §6를 통과하는지 실제 실행으로 검증
//  실행:
//    cd backend && LAB_COLLECTOR=docker node scripts/labValidationGate.mjs <issueType>
//    cd backend && LAB_COLLECTOR=docker node scripts/labValidationGate.mjs --all
//  전제: lab 스택 기동(수집기 :8899). --all 은 지원 issue_type 전수 회귀 검증.
// =====================================================================
import { validateLab } from '../src/labValidationGate.js'
import { TEMPLATES } from '../src/lab.js'

const arg = process.argv[2]
if (!arg) { console.error('사용법: node scripts/labValidationGate.mjs <issueType> | --all'); process.exit(1) }

const ICON = { pass: '✓', fail: '✗', warn: '⚠' }

function printReport(rep) {
  console.log(`\n${rep.passed ? '✅ PASS' : '❌ FAIL'}  ${rep.issueType}  (fail:${rep.failCount} warn:${rep.warnCount}${rep.run ? ` · ${rep.run.id}` : ''})`)
  for (const c of rep.checks) console.log(`   ${ICON[c.status]} ${c.label.padEnd(22)} ${c.detail}`)
}

async function main() {
  if (arg === '--all') {
    const all = [...new Set(Object.values(TEMPLATES).flatMap((t) => t.issueTypes))]
    console.log(`검증 게이트 전수 실행 — ${all.length}개 issue_type\n`)
    const results = []
    for (const it of all) {
      const rep = await validateLab(it)
      results.push(rep)
      console.log(`${rep.passed ? '✅' : '❌'} ${it.padEnd(38)} fail:${rep.failCount} warn:${rep.warnCount}` +
        (rep.passed ? '' : '  → ' + rep.checks.filter((c) => c.status === 'fail').map((c) => c.label).join(', ')))
    }
    const passed = results.filter((r) => r.passed).length
    console.log(`\n═══ 결과: ${passed}/${results.length} PASS ═══`)
    const failed = results.filter((r) => !r.passed)
    if (failed.length) {
      console.log('\n실패 상세:')
      failed.forEach(printReport)
      process.exit(1)
    }
    return
  }
  const rep = await validateLab(arg)
  printReport(rep)
  process.exit(rep.passed ? 0 : 1)
}

main().catch((e) => { console.error('gate 실패:', e.message); process.exit(1) })
