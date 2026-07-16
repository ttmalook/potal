// =====================================================================
// AI Recipe Compiler — SSC 메타/조치방안 → LabRecipe(JSON 데이터).
//  · 표준 프롬프트(제작표준 MD) + 스키마 지시 + 매칭 프로파일 few-shot 으로 Claude 유도.
//  · Claude 출력은 신뢰 전 강제 검증: 코드펜스 제거 → JSON 추출 → validateRecipe.
//  · 실패 시 원문 전체가 아니라 제한 preview + 오류코드만 반환.
//  · Claude 는 '레시피(데이터)'만 만든다. 실제 환경은 결정적 렌더러가, 검증은 게이트가.
// =====================================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { callClaude, claudeModel } from './claudeClient.js'
import { validateRecipe, ARCHETYPES, VERIFICATION_KINDS, NET_BAKED_PORTS } from './labRecipes.js'
import { autoBuildableHeaderProfiles } from './labProfiles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STANDARD_PATH = path.join(__dirname, '..', '..', 'docs', 'SSC_VALIDATION_LAB_AUTHORING_STANDARD.md')

// 제작표준 MD 를 읽되, 배포 환경에서 못 읽으면 압축 폴백 프롬프트 사용.
function authoringStandard() {
  try { return fs.readFileSync(STANDARD_PATH, 'utf8') } catch { return null }
}
const FALLBACK_STANDARD = [
  '검증랩 제작 표준(요약):',
  '1) 증적은 실제다 — 취약/조치 두 상태의 실제 관측 차이만 증적으로 인정.',
  '2) 각 항목만 — 해당 issue_type 에 정확히 해당하는 것만(무관한 헤더/행 금지).',
  '3) 정직하게 — 참고용 PoC, 고객환경 검증 아님. SSC 재스캔으로 확인.',
  'http_header 랩: 취약=헤더 부재/약한 값, 조치=올바른 헤더/값. curl -sSI 로 관측.',
  '검증 의미(verificationSemantics)를 정확히: 단순 존재(presence) vs 값(value) 구분. CSP 정책분석/쿠키속성/리다이렉트는 별도(자동 대상 아님).'
].join('\n')

const SCHEMA_INSTRUCTION = `너의 유일한 산출물은 아래 스키마를 따르는 LabRecipe JSON 하나다. 설명·인사말·코드펜스 없이 JSON 객체만 출력하라.

LabRecipe = {
  "issueType": "<소문자 SSC key 그대로>",
  "archetype": ${JSON.stringify(ARCHETYPES)} 중 하나,   // Phase 1 은 "http_header"
  "protocol": "http" | "https",
  "targetEngine": "generic",
  "verificationSemantics": {
    "kind": ${JSON.stringify(VERIFICATION_KINDS)} 중 하나,   // 단순 존재="http_header_presence", 값 비교="http_header_value"
    "header": "<정확한 응답 헤더명>",
    "before": "<취약 상태: 'missing' 또는 약한 값>",
    "after": "<조치 상태: 올바른 헤더 값>"
  },
  "guide": { "direction": "<한 문장 조치 방향>", "steps": ["<3~4개 단계>"] },
  "catalog": {
    "display_name": "<영문 이름>", "koName": "<한글 이름>",
    "ssc_factor": "<factor>", "severity": "low|medium|high",
    "why": "<왜 위험한지 한국어 2~3문장>",
    "whereToChange": ["<조치 위치>"], "verification": ["<검증 명령>"]
  },
  "sourceDiff": { "label": "<라벨>", "file": "conf.d/default.conf", "language": "nginx",
    "inline": { "before": "# 취약: 헤더 없음", "after": "add_header <Header> \\"<value>\\" always;" } },
  "checklist": [ {"item":"<제작표준 점검항목>","done":false}, ... 정확히 12개 ]
}

network 아키타입일 때는 verificationSemantics = { "kind":"network_port_exposed", "port":<정수>, "service":"<서비스명>" } 로 하고 header/before/after 대신 port 를 쓴다. port 는 반드시 다음 중 하나여야 한다(랩 타깃 리스닝 포트): ${NET_BAKED_PORTS.join(', ')}. sourceDiff.inline 은 방화벽 규칙 예시(before: allow tcp/<port> from 0.0.0.0/0, after: deny tcp/<port> from 0.0.0.0/0)로 한다. catalog.verification 은 "nmap -Pn -p <port> <host>" 형태.

규칙: before 와 after 는 반드시 서로 달라야 한다(취약↔조치 차이). 값을 추측하지 말고 SSC 조치방안과 표준 규범에 근거하라. CSP/쿠키/리다이렉트처럼 단순 존재/값 검증이 아니면 이 자동 경로 대상이 아니므로 그 사실을 반영해 보수적으로 작성하라.`

function fewShot() {
  const ex = autoBuildableHeaderProfiles()[0]
  return `참고(형식 예시) — 기존 지원 랩 "${ex.issueType}" 의 검증 의미: ${JSON.stringify(ex.verificationSemantics)}`
}

// Claude 원문에서 JSON 객체만 안전 추출.
function extractJson(text) {
  let t = String(text || '').trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '') // 코드펜스 제거
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  const slice = t.slice(a, b + 1)
  try { return JSON.parse(slice) } catch { return null }
}

// issue: { key, title, factor, severity, recommendation } · classification: classifyIssue 결과
export async function compileRecipe(issue, classification) {
  const std = authoringStandard() || FALLBACK_STANDARD
  const system = `${std}\n\n=== 산출 형식 ===\n${SCHEMA_INSTRUCTION}`
  const user = [
    `SSC issue_type: ${issue.key}`,
    `제목: ${issue.title || ''}`,
    `factor: ${issue.factor || ''} · severity: ${issue.severity || ''}`,
    `SSC 공식 조치방안(recommendation): ${issue.recommendation || '(없음 — 표준 헤더 규범에 근거)'}`,
    `분류기 판정: ${classification?.verdict || '?'} (family=${classification?.family || '?'}, semanticsKind=${classification?.semanticsKind || '?'})`,
    fewShot(),
    '',
    '위 issue 에 대한 LabRecipe JSON 하나만 출력하라.'
  ].join('\n')

  let out
  try {
    out = await callClaude(system, user)
  } catch (e) {
    return { ok: false, code: e.code || 'CLAUDE_ERROR', message: e.message }
  }
  const parsed = extractJson(out.text)
  if (!parsed) {
    return { ok: false, code: 'CLAUDE_RESPONSE_PARSE_FAILED', message: '응답을 JSON 으로 해석하지 못했습니다.', rawPreview: String(out.text).slice(0, 2000) }
  }
  // SSC key 는 서버가 신뢰(모델 추측 방지) — issueType 강제.
  parsed.issueType = String(issue.key || parsed.issueType || '').toLowerCase()
  const v = validateRecipe(parsed)
  if (!v.ok) {
    return { ok: false, code: 'RECIPE_SCHEMA_INVALID', message: '레시피 스키마 검증 실패', errors: v.errors, rawPreview: JSON.stringify(parsed).slice(0, 2000) }
  }
  return { ok: true, recipe: v.recipe, generator: { provider: 'anthropic', model: out.model || claudeModel(), generatedAt: new Date().toISOString() }, usage: out.usage }
}
