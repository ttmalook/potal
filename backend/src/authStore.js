// =====================================================================
// 인증 저장소 — Postgres(doc store) 우선, 실패 시 파일 폴백 (portalStore와 동일 패턴)
//  - users: id = email(소문자). refreshTokens: id = tokenHash.
//  - 비밀번호는 해시만, refresh 토큰도 해시로만 저장.
//  - DB 사용 시 최초 1회 파일→DB 이관(migrateAuthIfEmpty).
// =====================================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '..', 'data', 'auth-store.json')
const U = 'auth_users'
const R = 'auth_refresh_tokens'

function loadFile() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return { users: [], refreshTokens: [] } }
}
function saveFile() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(fileState, null, 2)) } catch (e) { console.error('[authStore] save failed:', e.message) }
}
const fileState = loadFile()

// ── users ──
export async function getUserByEmail(email) {
  const id = String(email || '').toLowerCase()
  if (db.isDbEnabled()) return (await db.docGet(U, id)) || undefined
  return fileState.users.find((u) => u.email === id)
}
export async function getUserById(id) {
  if (db.isDbEnabled()) return (await db.docList(U)).find((u) => u.id === id)
  return fileState.users.find((u) => u.id === id)
}
export async function addUser(u) {
  if (db.isDbEnabled()) { await db.docUpsert(U, u.email, u); return }
  fileState.users.push(u); saveFile()
}
export async function userCount() {
  if (db.isDbEnabled()) return db.docCount(U)
  return fileState.users.length
}
export async function listUsers() {
  if (db.isDbEnabled()) return db.docList(U)
  return [...fileState.users]
}
export async function updateUser(id, patch) {
  const u = await getUserById(id)
  if (!u) return null
  const next = { ...u, ...patch, id: u.id, email: u.email } // id·email 불변
  if (db.isDbEnabled()) { await db.docUpsert(U, next.email, next); return next }
  const i = fileState.users.findIndex((x) => x.id === id)
  fileState.users[i] = next; saveFile(); return next
}
export async function adminCount() {
  return (await listUsers()).filter((u) => u.role === 'admin').length
}

// ── refresh tokens (해시 저장, 회전/재사용탐지용) ──
export async function addRefresh(rec) {
  if (db.isDbEnabled()) { await db.docUpsert(R, rec.tokenHash, rec); return }
  fileState.refreshTokens.push(rec); saveFile()
}
export async function findRefresh(tokenHash) {
  if (db.isDbEnabled()) return (await db.docGet(R, tokenHash)) || undefined
  return fileState.refreshTokens.find((r) => r.tokenHash === tokenHash)
}
export async function revokeToken(tokenHash) {
  if (db.isDbEnabled()) { const r = await db.docGet(R, tokenHash); if (r && !r.revoked) await db.docUpsert(R, tokenHash, { ...r, revoked: true }); return }
  const r = fileState.refreshTokens.find((x) => x.tokenHash === tokenHash); if (r && !r.revoked) { r.revoked = true; saveFile() }
}
export async function revokeFamily(family) {
  if (db.isDbEnabled()) {
    const list = (await db.docList(R)).filter((r) => r.family === family && !r.revoked)
    for (const r of list) await db.docUpsert(R, r.tokenHash, { ...r, revoked: true })
    return list.length
  }
  let n = 0
  for (const r of fileState.refreshTokens) if (r.family === family && !r.revoked) { r.revoked = true; n++ }
  if (n) saveFile()
  return n
}
// 비밀번호 변경/재설정 시 해당 사용자의 모든 세션 폐기(다른 기기 강제 로그아웃).
export async function revokeAllForUser(userId) {
  if (db.isDbEnabled()) {
    const list = (await db.docList(R)).filter((r) => r.userId === userId && !r.revoked)
    for (const r of list) await db.docUpsert(R, r.tokenHash, { ...r, revoked: true })
    return list.length
  }
  let n = 0
  for (const r of fileState.refreshTokens) if (r.userId === userId && !r.revoked) { r.revoked = true; n++ }
  if (n) saveFile()
  return n
}
export async function pruneExpired() {
  const now = Date.now()
  if (db.isDbEnabled()) { for (const r of await db.docList(R)) if (Date.parse(r.expiresAt) <= now) await db.docDelete(R, r.tokenHash); return }
  const before = fileState.refreshTokens.length
  fileState.refreshTokens = fileState.refreshTokens.filter((r) => Date.parse(r.expiresAt) > now)
  if (fileState.refreshTokens.length !== before) saveFile()
}

// 최초 1회: DB가 비어있으면 파일의 users 를 DB로 이관 (refresh 토큰은 휘발성이라 이관 생략)
export async function migrateAuthIfEmpty() {
  if (!db.isDbEnabled()) return
  if ((await db.docCount(U)) > 0) return
  const users = fileState.users || []
  for (const u of users) await db.docUpsert(U, u.email, u)
  if (users.length) console.log(`[authStore] Postgres 초기 이관 — users:${users.length}`)
}
