// =====================================================================
// LabRecipe 레지스트리 — SSC 기반 AI Lab Builder 의 "단일 랩 정의(데이터)"
//  - Claude(AI Recipe Compiler)가 만드는 것은 실행 코드가 아니라 이 레시피(데이터)뿐.
//  - 결정적 렌더러/collector/게이트가 레시피를 소비해 실제 환경·검증을 만든다.
//  - 저장: Postgres(lab_recipes) 우선, 없으면 파일(data/lab-recipes.json). 재시작 후 유지.
//  - 채택은 immutable 버전: 같은 issueType 도 v1/v2/v3 보존, 채택본만 status='active'.
//  - mapIssueType/guideFor(동기) 를 위해 active 레시피를 인메모리 캐시로 유지(부팅+채택 시 갱신).
//  * 기존 50종(하드코딩)은 건드리지 않는다. 레시피는 '신규 랩'만 담는다(추가형).
// =====================================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '..', 'data', 'lab-recipes.json')
const TABLE = 'lab_recipes'
export const RECIPE_SCHEMA_VERSION = 1

// 지원 아키타입(화이트리스트) — 렌더러/collector 가 실제로 처리 가능한 패밀리만.
export const ARCHETYPES = ['http_header', 'network'] // Phase 2: network 확장. tls/dns/ssh 는 후속.
// verificationSemantics.kind 화이트리스트(패밀리별 검증 의미).
export const VERIFICATION_KINDS = ['http_header_presence', 'http_header_value', 'network_port_exposed']
// 네트워크 랩 타깃(lab-net-vulnerable)이 실제로 리스닝하는 포트 — 레시피 포트는 이 안이어야 재현됨.
export const NET_BAKED_PORTS = [21, 23, 53, 143, 389, 445, 1723, 3306, 3389, 5432, 5900, 5984, 6379, 8080, 9042, 9200, 27017]

// ── 저장소 (Postgres or 파일) ────────────────────────────────────────
function loadFile() {
  try { if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch (e) { console.error('[recipes] load 실패:', e.message) }
  return { recipes: [] }
}
function saveFile(state) {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)) } catch (e) { console.error('[recipes] write 실패:', e.message) }
}
export async function listRecipes() {
  return db.isDbEnabled() ? db.docList(TABLE) : loadFile().recipes
}
export async function getRecipeById(id) {
  return db.isDbEnabled() ? db.docGet(TABLE, id) : (loadFile().recipes.find((r) => r.id === id) || null)
}
async function putRecipe(rec) {
  if (db.isDbEnabled()) { await db.docUpsert(TABLE, rec.id, rec); return }
  const s = loadFile(); s.recipes = [rec, ...s.recipes.filter((r) => r.id !== rec.id)]; saveFile(s)
}
async function removeRecipe(id) {
  if (db.isDbEnabled()) { await db.docDelete(TABLE, id); return }
  const s = loadFile(); s.recipes = s.recipes.filter((r) => r.id !== id); saveFile(s)
}

// ── 인메모리 active 캐시 (동기 조회용) ───────────────────────────────
const activeByIssue = new Map()  // issueType -> active recipe (채택본)
const stagingByIssue = new Map() // issueType -> 게이트 중인 candidate(채택 전 임시 해석)
export async function loadActiveRecipes() {
  activeByIssue.clear()
  for (const r of await listRecipes()) if (r && r.status === 'active') activeByIssue.set(String(r.issueType || '').toLowerCase(), r)
  return activeByIssue.size
}
// 게이트 중 candidate 를 임시로 해석 가능하게(staging 이 active 보다 우선). 채택 전 검증용.
export function setStaging(recipe) { if (recipe?.issueType) stagingByIssue.set(String(recipe.issueType).toLowerCase(), recipe) }
export function clearStaging(issueType) { stagingByIssue.delete(String(issueType || '').toLowerCase()) }
export function getActiveRecipe(issueType) {
  const k = String(issueType || '').toLowerCase()
  return stagingByIssue.get(k) || activeByIssue.get(k) || null
}
export function activeRecipeIssueTypes() { return [...activeByIssue.keys()] }

// ── 스키마 검증/정규화 ───────────────────────────────────────────────
// Claude 출력을 신뢰 전에 강제 검증. 실패 사유를 배열로 반환(호출부가 재생성/거절 판단).
export function validateRecipe(obj) {
  const errors = []
  const o = obj && typeof obj === 'object' ? obj : {}
  const str = (v) => (typeof v === 'string' ? v.trim() : '')
  const issueType = str(o.issueType)
  if (!issueType) errors.push('issueType 누락')
  const archetype = str(o.archetype)
  if (!ARCHETYPES.includes(archetype)) errors.push(`archetype 미지원: ${archetype || '(빈값)'} (허용: ${ARCHETYPES.join(',')})`)

  const vs = o.verificationSemantics && typeof o.verificationSemantics === 'object' ? o.verificationSemantics : null
  if (!vs) errors.push('verificationSemantics 누락(1급 필드)')
  else if (!VERIFICATION_KINDS.includes(str(vs.kind))) errors.push(`verificationSemantics.kind 미지원: ${str(vs.kind) || '(빈값)'}`)
  else if (archetype === 'network') {
    const port = Number(vs.port)
    if (!NET_BAKED_PORTS.includes(port)) errors.push(`network 포트 ${vs.port ?? '(없음)'} 는 랩 타깃이 리스닝하지 않음(가능: ${NET_BAKED_PORTS.join(',')})`)
  } else { // http_header
    if (!str(vs.header)) errors.push('verificationSemantics.header 누락')
    if (!str(vs.before)) errors.push('verificationSemantics.before 누락')
    if (!str(vs.after)) errors.push('verificationSemantics.after 누락')
    if (str(vs.before) && str(vs.before) === str(vs.after)) errors.push('verificationSemantics.before 와 after 가 동일(취약↔조치 차이 없음)')
  }

  const guide = o.guide && typeof o.guide === 'object' ? o.guide : null
  if (!guide || !str(guide.direction)) errors.push('guide.direction 누락')
  const steps = Array.isArray(guide?.steps) ? guide.steps.filter((s) => str(s)) : []
  if (!steps.length) errors.push('guide.steps 누락')

  const cat = o.catalog && typeof o.catalog === 'object' ? o.catalog : null
  if (!cat || !str(cat.display_name)) errors.push('catalog.display_name 누락')
  if (!cat || !str(cat.koName)) errors.push('catalog.koName 누락')
  if (!cat || !str(cat.why)) errors.push('catalog.why 누락')

  const sd = o.sourceDiff && typeof o.sourceDiff === 'object' ? o.sourceDiff : null
  const inline = sd?.inline && typeof sd.inline === 'object' ? sd.inline : null
  if (!inline || !str(inline.before) || !str(inline.after)) errors.push('sourceDiff.inline.before/after 누락')

  const checklist = Array.isArray(o.checklist) ? o.checklist : []
  if (checklist.length < 12) errors.push(`checklist 12개 필요(현재 ${checklist.length})`)

  if (errors.length) return { ok: false, errors, recipe: null }

  // 정규화(신뢰 가능한 형태로 재구성 — 알 수 없는 필드는 버림)
  const recipe = {
    schemaVersion: RECIPE_SCHEMA_VERSION,
    issueType,
    archetype,
    protocol: str(o.protocol) || 'http',
    targetEngine: str(o.targetEngine) || 'generic',
    verificationSemantics: archetype === 'network'
      ? { kind: str(vs.kind), port: Number(vs.port), service: str(vs.service) || issueType, before: 'open', after: 'closed' }
      : { kind: str(vs.kind), header: str(vs.header), value: str(vs.value) || str(vs.after), before: str(vs.before), after: str(vs.after) },
    guide: { direction: str(guide.direction), steps },
    catalog: {
      display_name: str(cat.display_name), koName: str(cat.koName),
      ssc_factor: str(cat.ssc_factor) || 'application_security',
      severity: str(cat.severity) || 'low',
      why: str(cat.why),
      whereToChange: Array.isArray(cat.whereToChange) ? cat.whereToChange.filter((s) => str(s)) : [],
      verification: Array.isArray(cat.verification) ? cat.verification.filter((s) => str(s)) : []
    },
    sourceDiff: { label: str(sd.label) || '이 항목에 해당하는 설정 변경', file: str(sd.file) || (archetype === 'network' ? 'firewall / security group' : 'conf.d/default.conf'), language: str(sd.language) || (archetype === 'network' ? 'text' : 'nginx'), inline: { before: str(inline.before), after: str(inline.after) } },
    collectorAssertion: o.collectorAssertion && typeof o.collectorAssertion === 'object' ? o.collectorAssertion : {},
    checklist: checklist.map((c) => (typeof c === 'string' ? { item: c, done: false } : { item: str(c.item), done: !!c.done })).filter((c) => c.item)
  }
  return { ok: true, errors: [], recipe }
}

// ── 버전/후보/채택 ───────────────────────────────────────────────────
async function nextVersion(issueType) {
  const mine = (await listRecipes()).filter((r) => r.issueType === issueType)
  return mine.reduce((m, r) => Math.max(m, Number(r.version) || 0), 0) + 1
}

// 검증 통과한 레시피를 후보(candidate)로 저장. immutable 버전 부여.
export async function addCandidate(normalizedRecipe, generator = {}) {
  const version = await nextVersion(normalizedRecipe.issueType)
  const rec = {
    ...normalizedRecipe,
    id: `${normalizedRecipe.issueType}#v${version}`,
    version,
    status: 'candidate',
    generator: { provider: generator.provider || null, model: generator.model || null, generatedAt: generator.generatedAt || new Date().toISOString() },
    gate: null,
    createdAt: new Date().toISOString()
  }
  await putRecipe(rec)
  return rec
}

// 게이트 결과 기록(채택 전 통과 근거).
export async function recordGate(id, gateResult) {
  const rec = await getRecipeById(id)
  if (!rec) return null
  rec.gate = { passed: !!gateResult?.passed, failCount: gateResult?.failCount ?? null, at: new Date().toISOString() }
  await putRecipe(rec)
  return rec
}

// 채택: 이 버전을 active 로, 같은 issueType 의 기존 active 는 archived 로. 캐시 갱신.
export async function adoptRecipe(id) {
  const rec = await getRecipeById(id)
  if (!rec) return { ok: false, message: '레시피 없음' }
  if (!rec.gate?.passed) return { ok: false, message: '게이트 미통과 레시피는 채택할 수 없습니다.' }
  for (const other of (await listRecipes()).filter((r) => r.issueType === rec.issueType && r.status === 'active' && r.id !== id)) {
    other.status = 'archived'; await putRecipe(other)
  }
  rec.status = 'active'; rec.adoptedAt = new Date().toISOString()
  await putRecipe(rec)
  await loadActiveRecipes()
  return { ok: true, recipe: rec }
}

export async function deleteRecipe(id) {
  const rec = await getRecipeById(id)
  await removeRecipe(id)
  if (rec?.status === 'active') await loadActiveRecipes()
  return { ok: true }
}
