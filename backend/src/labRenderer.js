// =====================================================================
// 결정적 렌더러 — LabRecipe(데이터) → 실제 환경 요청 계획(deterministic).
//  · Claude 텍스트를 실행하지 않는다. 화이트리스트 아키타입만 처리.
//  · Phase 1(빠른 방식): http_header 레시피 → 제네릭 HTTP 응답기의 before/after 요청 경로.
//    렌더 결과(plan)를 runLab 이 collector 로 넘기고, collector 는 이 plan 을 실행만 한다.
//  · Phase 2: 동일 레시피로 임시 nginx config 렌더링으로 강화(여기서 분기 확장).
// =====================================================================
import { ARCHETYPES } from './labRecipes.js'

export function assertRenderable(recipe) {
  if (!recipe || !ARCHETYPES.includes(recipe.archetype)) {
    throw Object.assign(new Error(`렌더 불가 아키타입: ${recipe?.archetype || '(없음)'}`), { code: 'LAB_ARCHETYPE_UNSUPPORTED' })
  }
}

// http_header 레시피 → 제네릭 응답기 요청 계획.
function buildHttpHeaderPlan(recipe) {
  const vs = recipe.verificationSemantics
  const header = vs.header
  const q = (h, v) => (v == null ? `/?h=${encodeURIComponent(h)}` : `/?h=${encodeURIComponent(h)}&v=${encodeURIComponent(v)}`)
  let before
  let after
  if (vs.kind === 'http_header_presence') {
    before = { path: q(header, null), expect: 'absent' }       // 취약: 헤더 부재
    after = { path: q(header, vs.after), expect: 'present', value: vs.after }
  } else { // http_header_value
    before = { path: q(header, vs.before), expect: 'weak', value: vs.before }
    after = { path: q(header, vs.after), expect: 'strong', value: vs.after }
  }
  return {
    archetype: 'http_header',
    generic: true,
    focusHeader: header.toLowerCase(),
    diffKey: header,
    before,
    after,
    labels: {
      before: `조치 전 · curl -I (${header}: ${vs.before})`,
      after: `조치 후 · curl -I (${header}: ${vs.after})`
    }
  }
}

// network 레시피 → nmap 포트 스캔 계획(기존 net-vulnerable/remediated 재사용).
function buildNetworkPlan(recipe) {
  const port = Number(recipe.verificationSemantics.port)
  return {
    archetype: 'network', generic: true, port,
    service: recipe.verificationSemantics.service || recipe.issueType,
    labels: { before: `조치 전 · nmap (tcp/${port} open)`, after: `조치 후 · nmap (tcp/${port} closed)` }
  }
}

// 레시피 → collector 실행 계획(plan). 아키타입별 분기.
export function buildRenderPlan(recipe) {
  assertRenderable(recipe)
  if (recipe.archetype === 'http_header') return buildHttpHeaderPlan(recipe)
  if (recipe.archetype === 'network') return buildNetworkPlan(recipe)
  throw Object.assign(new Error(`렌더러 미구현 아키타입: ${recipe.archetype}`), { code: 'LAB_ARCHETYPE_UNSUPPORTED' })
}
