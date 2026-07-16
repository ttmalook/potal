// =====================================================================
// 앱 설정 저장 — SSC API 토큰(관리자 관리)
//  - 관리자만 설정/삭제(엔드포인트에서 requireAdmin). 파트너는 서버에서 자동 사용.
//  - 저장 시 AES-256-GCM 암호화(KEK = AUTH_ACCESS_SECRET 파생). 평문 저장 안 함.
//  - 토큰 값은 어떤 클라이언트에도 반환하지 않음(상태 API는 ****last4 + 출처만).
//  - 부팅 시 DB→메모리 오버라이드 로드. 클라이언트는 sscTokenOverride()(동기)로 읽음.
//  - 우선순위: 관리자 설정(DB) > backend/.env 폴백.
// =====================================================================
import crypto from 'crypto'
import * as db from './db.js'

const TABLE = 'app_settings'
const KEY = 'ssc_api_token'
const KEY_CLAUDE = 'claude_api_key'
const PLACEHOLDERS = ['replace-with-real-token', 'replace_with_real_token', '']
const mem = new Map()      // DB 비활성(파일모드) 폴백 저장
let override = null        // 메모리 상 활성 SSC 토큰(복호화됨) | null
let claudeOverride = null  // 메모리 상 활성 Claude API 키(복호화됨) | null

const DEFAULT_SECRET = 'dev-access-secret-change-me'
// KEK — 용도별 salt 로 도메인 분리(SSC 토큰 ≠ Claude 키).
function kekFor(purpose) {
  const secret = process.env.AUTH_ACCESS_SECRET || DEFAULT_SECRET
  return crypto.createHash('sha256').update(purpose + ':' + secret).digest() // 32 bytes
}
// KEK 근원이 코드 기본값이면 DB 암호화가 취약(공개 기본값에서 파생) → 민감 키의 DB 저장 차단.
function kekIsWeak() {
  const s = process.env.AUTH_ACCESS_SECRET || ''
  return !s || s === DEFAULT_SECRET
}
function encryptWith(kek, plain) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', kek, iv)
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':')
}
function decryptWith(kek, blob) {
  try {
    const [i, t, e] = String(blob).split(':')
    const d = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(i, 'hex'))
    d.setAuthTag(Buffer.from(t, 'hex'))
    return Buffer.concat([d.update(Buffer.from(e, 'hex')), d.final()]).toString('utf8')
  } catch { return null }
}
const encrypt = (plain) => encryptWith(kekFor('ssc-token-kek'), plain)
const decrypt = (blob) => decryptWith(kekFor('ssc-token-kek'), blob)
const encryptClaude = (plain) => encryptWith(kekFor('claude-key-kek'), plain)
const decryptClaude = (blob) => decryptWith(kekFor('claude-key-kek'), blob)

async function readRec(id = KEY) {
  if (db.isDbEnabled()) { try { return await db.docGet(TABLE, id) } catch { return null } }
  return mem.get(id) || null
}
async function writeRec(rec, id = KEY) {
  if (db.isDbEnabled()) { try { await db.docUpsert(TABLE, id, rec) } catch { /* noop */ } }
  else mem.set(id, rec)
}
async function deleteRec(id = KEY) {
  if (db.isDbEnabled()) { try { await db.docDelete(TABLE, id) } catch { /* noop */ } }
  else mem.delete(id)
}

// 부팅 시 DB 토큰을 메모리 오버라이드로 로드
export async function loadSscTokenOverride() {
  const rec = await readRec()
  override = rec?.enc ? decrypt(rec.enc) : null
  return !!override
}

// 클라이언트가 동기로 읽는 활성 오버라이드(없으면 null → env 폴백)
export function sscTokenOverride() { return override }

// 관리자 설정 — 암호화 저장 + 메모리 반영
export async function setSscToken(token, actorEmail) {
  const t = String(token || '').trim()
  if (!t || PLACEHOLDERS.includes(t)) return { ok: false, message: '유효한 토큰이 아닙니다.' }
  await writeRec({ enc: encrypt(t), last4: t.slice(-4), setBy: actorEmail || null, at: new Date().toISOString() })
  override = t
  return { ok: true }
}
export async function clearSscToken() {
  await deleteRec()
  override = null
  return { ok: true }
}

// 상태(값 미노출): { configured, source: 'db'|'env'|'none', hint: '****1234', setBy, at }
export async function sscTokenStatus() {
  const rec = await readRec()
  if (rec?.enc) return { configured: true, source: 'db', hint: `****${rec.last4 || ''}`, setBy: rec.setBy || null, at: rec.at || null }
  const env = process.env.SSC_API_TOKEN || process.env.SECURITYSCORECARD_API_TOKEN || ''
  if (env && !PLACEHOLDERS.includes(env)) return { configured: true, source: 'env', hint: `****${env.slice(-4)}`, setBy: null, at: null }
  return { configured: false, source: 'none', hint: null, setBy: null, at: null }
}

// ── Claude API 키 (관리자 관리, AES-GCM 암호화, 원문 절대 미노출) ──────
export async function loadClaudeKeyOverride() {
  const rec = await readRec(KEY_CLAUDE)
  claudeOverride = rec?.enc ? decryptClaude(rec.enc) : null
  return !!claudeOverride
}
// 서버 내부에서만 사용(응답/로그로 나가지 않음). 우선순위: 관리자 설정(DB) > .env(ANTHROPIC_API_KEY).
export function claudeKeyOverride() { return claudeOverride }
export async function setClaudeKey(token, actorEmail) {
  const t = String(token || '').trim()
  if (!t || t.length < 12) return { ok: false, message: '유효한 Claude API 키가 아닙니다.' }
  // KEK 취약 시 DB 저장 차단 — .env(ANTHROPIC_API_KEY) 사용 또는 강한 AUTH_ACCESS_SECRET 설정 유도.
  if (kekIsWeak()) return { ok: false, code: 'WEAK_KEK', message: 'AUTH_ACCESS_SECRET 가 기본값이라 DB 암호화가 취약합니다. backend/.env 의 ANTHROPIC_API_KEY 를 사용하거나, 강한 AUTH_ACCESS_SECRET 설정 후 다시 시도하세요.' }
  await writeRec({ enc: encryptClaude(t), last4: t.slice(-4), setBy: actorEmail || null, at: new Date().toISOString() }, KEY_CLAUDE)
  claudeOverride = t
  return { ok: true }
}
export async function clearClaudeKey() {
  await deleteRec(KEY_CLAUDE)
  claudeOverride = null
  return { ok: true }
}
// 상태(값 미노출): { configured, source, hint: '****1234', setBy, at }
export async function claudeKeyStatus() {
  const rec = await readRec(KEY_CLAUDE)
  if (rec?.enc) return { configured: true, source: 'db', hint: `****${rec.last4 || ''}`, setBy: rec.setBy || null, at: rec.at || null }
  const env = process.env.ANTHROPIC_API_KEY || ''
  if (env) return { configured: true, source: 'env', hint: `****${env.slice(-4)}`, setBy: null, at: null }
  return { configured: false, source: 'none', hint: null, setBy: null, at: null }
}
