// =====================================================================
// Lab Validation Gate — 제작 표준 §6를 자동 확인하는 검증 게이트
//  "이 issue_type의 랩이 진짜 취약/조치를 재현하는가?"를 실제 실행으로 검증.
//  - 47개 직접 제작 시: 채택 전 통과 확인.
//  - 나중 LLM 파이프라인: 초안이 이 게이트를 통과해야 사람 검토로 넘어감.
//  전제: LAB_COLLECTOR=docker + lab 스택 기동(수집기 :8899). 실제 랩을 돌린다.
// =====================================================================
import { getIssueTypeCatalog } from './securityScorecardIssueCollector.js'
import { runLab, mapIssueType } from './lab.js'

// status: 'pass' | 'fail' | 'warn'  (fail 하나라도 있으면 게이트 불통과)
export async function validateLab(issueType, opts = {}) {
  const checks = []
  const add = (id, label, status, detail = '') => checks.push({ id, label, status, detail: String(detail).slice(0, 160) })

  // §6-7) 실제 SSC key 인가 (유령 아님)
  try {
    const cat = await getIssueTypeCatalog({ force: false })
    if (cat?.ok) {
      const real = (cat.keys || []).includes(issueType)
      add('real_ssc_key', 'SSC 실제 issue_type', real ? 'pass' : 'fail', real ? issueType : 'metadata/issue-types 에 없음(유령?)')
    } else {
      add('real_ssc_key', 'SSC 실제 issue_type', 'warn', 'SSC 카탈로그 조회 불가(토큰?) — 스킵')
    }
  } catch (e) {
    add('real_ssc_key', 'SSC 실제 issue_type', 'warn', 'SSC 조회 예외 — 스킵')
  }

  // 랩 템플릿 매핑
  const tpl = mapIssueType(issueType)
  add('template_mapped', '랩 템플릿 매핑', tpl ? 'pass' : 'fail', tpl ? tpl.id : '매핑 없음(unsupported)')
  if (!tpl) return finalize(issueType, checks, null)

  // 실제 랩 실행
  let run
  try {
    run = await runLab({ issueType, domain: opts.domain || 'validation.local', serviceEndpoint: opts.serviceEndpoint || 'lab:0', sscLookupDomain: opts.domain || 'validation.local' })
  } catch (e) {
    add('run_succeeded', '랩 실행 성공', 'fail', e.message)
    return finalize(issueType, checks, null)
  }
  add('run_succeeded', '랩 실행 성공', run.status === 'succeeded' ? 'pass' : 'fail', run.note || run.status)
  if (run.status !== 'succeeded') return finalize(issueType, checks, run)

  // §0-1) 실제 수집기(docker)인가 — simulated/폴백이면 실측 아님
  const fallback = run.evidence?.raw_summary?.fallback
  add('collector_real', '실제 수집기(docker)', run.collector === 'docker' && !fallback ? 'pass' : 'warn',
    fallback ? `폴백: ${fallback}` : run.collector)

  // §6 핵심) 취약↔조치가 실제로 다른 결과를 내는가 (취약 타깃 취약 / 조치 타깃 고침)
  const td = run.evidence?.technical_diff || []
  const changed = td.filter((r) => r.changed && String(r.before) !== String(r.after))
  add('vuln_vs_fix_differ', '취약↔조치 결과 차이(핵심)', changed.length ? 'pass' : 'fail',
    changed.length ? changed.map((r) => `${r.key}: ${r.before}→${r.after}`).join(' | ') : '변화 없음 — 두 타깃이 동일 결과(재현 실패)')

  // §2) 조치 전/후 증적(실제 캡처/출력) 존재
  const hasVisual = !!(run.evidence?.visual_before?.screenshot || run.evidence?.visual_before?.url) &&
                    !!(run.evidence?.visual_after?.screenshot || run.evidence?.visual_after?.url)
  add('evidence_present', '조치 전/후 증적 존재', hasVisual ? 'pass' : 'fail', hasVisual ? '' : 'visual_before/after 누락')

  // §4-2) 실제 소스 diff (발췌/실제파일/랩정의)
  const sd = run.sourceDiff
  add('source_diff', '실제 소스 diff', sd && (sd.real || sd.focused || sd.lines?.length) ? 'pass' : 'warn',
    sd ? (sd.focused ? '발췌' : sd.real ? '실제파일' : '랩정의') : '없음')

  // §4-5 / §10) 이슈 전용 조치 방향 (generic 폴백 아님)
  const generic = /템플릿 가이드 준비 중/.test(run.guide?.direction || '')
  add('guide_specific', '이슈 전용 조치 방향', generic ? 'fail' : 'pass', (run.guide?.direction || '').slice(0, 40))

  // §5) 실행 로그에 실제 날짜·시간
  const hasTs = (run.logs || []).some((l) => /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(l))
  add('log_timestamped', '실행 로그 실제 시각', hasTs ? 'pass' : 'warn', hasTs ? '' : '상대시간?')

  return finalize(issueType, checks, run)
}

function finalize(issueType, checks, run) {
  const fails = checks.filter((c) => c.status === 'fail')
  const warns = checks.filter((c) => c.status === 'warn')
  return {
    issueType,
    passed: fails.length === 0,
    failCount: fails.length,
    warnCount: warns.length,
    checks,
    run: run ? { id: run.id, status: run.status, collector: run.collector } : null
  }
}
