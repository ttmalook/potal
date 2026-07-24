// =====================================================================
// Issue Classifier — 새 SSC issue_type 을 기존 랩 구조와 대조해 재현 경로를 판정.
//  판정: reuse | auto_build | extend | needs_infra | guide_only
//   · reuse       : 이미 지원되는 랩 존재(재사용).
//   · auto_build  : 기존 아키타입(제네릭 응답기)으로 레시피만으로 자동 재현 가능 → Claude 컴파일.
//   · extend      : 같은 패밀리지만 검증 의미가 단순 존재/값과 달라 전용 처리 필요(사람 확인).
//   · needs_infra : 새 아키타입/collector 필요(Phase 1 레시피 엔진 미지원 패밀리 포함).
//   · guide_only  : 인프라 랩으로 재현 불가(외부 데이터/평판/CVE 등).
//  * 이름 유사도가 아니라 '검증 의미(verificationSemantics)'로 판정 — HSTS(존재)≠CSP(정책분석).
//  레시피는 Claude(AI Recipe Compiler)가 만들고, 이 classifier 는 라우팅만 한다.
// =====================================================================
import { classify } from './labCoverage.js'
import { getProfile, autoBuildableHeaderProfiles } from './labProfiles.js'

// 레시피 엔진이 자동 빌드 가능한 아키타입(Phase 2: network 추가).
const RECIPE_FAMILIES = ['http_header', 'network']

export function classifyIssue({ key, title, factor }, supportedKeys) {
  const k = String(key || '').toLowerCase()
  const s = (k + ' ' + String(title || '')).toLowerCase()

  // 1) 이미 지원 → 재사용
  if (supportedKeys && supportedKeys.has(k)) {
    const prof = getProfile(k)
    return { verdict: 'reuse', family: prof?.archetype || classify(key, title, factor), reason: '이미 지원되는 랩이 있습니다(재사용).', similar: prof ? [prof.issueType] : [], autoBuildable: false }
  }

  // 2) 인프라 랩 재현 불가 → guide_only
  const fam = classify(key, title, factor)
  if (!fam) return { verdict: 'guide_only', family: null, reason: '인프라 랩으로 재현 불가(외부 통신/평판/CVE/PII 등).', similar: [], autoBuildable: false }

  // 3) 레시피 엔진 미지원 패밀리(tls/dns/ssh — 후속) → needs_infra
  if (!RECIPE_FAMILIES.includes(fam)) {
    return { verdict: 'needs_infra', family: fam, reason: `${fam} 패밀리는 아직 레시피 엔진 미지원. 새 아키타입/collector 개발 필요.`, similar: [], autoBuildable: false }
  }

  // 3-1) network — 서비스 포트 노출. 기존 net 타깃(nmap)으로 레시피 자동 재현(포트가 랩 타깃에 있을 때).
  if (fam === 'network') {
    return { verdict: 'auto_build', family: 'network', semanticsKind: 'network_port_exposed', autoBuildable: true, reason: '서비스 포트 노출 — 기존 net 타깃(nmap open→closed)으로 레시피만으로 자동 재현. 포트가 랩 타깃 리스닝 목록에 있어야 함.', similar: [] }
  }

  // 4) http_header — 검증 의미로 세분화
  const cspLike = /csp|content_security|content-security/.test(s)
  const cookieLike = /cookie/.test(s)
  const redirectLike = /redirect/.test(s)
  if (cspLike || cookieLike || redirectLike) {
    const kind = cspLike ? 'csp_policy' : cookieLike ? 'cookie_attr' : 'redirect_pattern'
    return {
      verdict: 'extend', family: 'http_header', semanticsKind: kind, autoBuildable: false,
      reason: '헤더 패밀리지만 검증 의미가 단순 존재/값과 다름(CSP 정책분석/쿠키속성/리다이렉트) → 전용 처리 필요. Claude 초안 후 사람 확인.',
      similar: []
    }
  }

  // 5) 단순 헤더 존재/값 → 제네릭 응답기로 자동 빌드 가능
  return {
    verdict: 'auto_build', family: 'http_header', semanticsKind: 'http_header_presence', autoBuildable: true,
    reason: '헤더 존재/값 패턴 — 제네릭 응답기로 레시피만으로 자동 재현 가능. Claude 가 레시피 컴파일.',
    similar: autoBuildableHeaderProfiles().map((p) => p.issueType)
  }
}
