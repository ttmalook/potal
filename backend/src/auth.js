// =====================================================================
// 인증 (의존성 없음: Node crypto)
//  - 비밀번호: scrypt (salt:hash)
//  - Access: HS256 JWT (수동 서명), 15분, 메모리(프론트)
//  - Refresh: 랜덤 opaque, httpOnly 쿠키(Path=/api/auth), 7일, 회전 + 재사용탐지
//  - 라우트(/api/auth/*)는 인증 예외. requireAuth 는 /api/portal·ssc·lab·integrations 에 적용.
// =====================================================================
import crypto from 'crypto'
import express from 'express'
import * as store from './authStore.js'
import { requireAdmin, permsForRole, normalizeRole } from './authz.js'
import { recordAudit } from './auditStore.js'

const ACCESS_SECRET = process.env.AUTH_ACCESS_SECRET || 'dev-access-secret-change-me'
const ACCESS_TTL_SEC = 15 * 60
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000
const REFRESH_COOKIE = 'ssc_rt'

// ── 비밀번호 (scrypt) ──
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  return `${salt}:${hash}`
}
export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  const h = crypto.scryptSync(String(pw), salt, 64)
  const b = Buffer.from(hash, 'hex')
  return h.length === b.length && crypto.timingSafeEqual(h, b)
}

// ── Access token: HS256 JWT (수동) ──
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
function signAccess(payload) {
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const now = Math.floor(Date.now() / 1000)
  const body = b64({ ...payload, iat: now, exp: now + ACCESS_TTL_SEC })
  const sig = crypto.createHmac('sha256', ACCESS_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}
export function verifyAccess(token) {
  const p = String(token || '').split('.')
  if (p.length !== 3) return null
  const expected = crypto.createHmac('sha256', ACCESS_SECRET).update(`${p[0]}.${p[1]}`).digest('base64url')
  const a = Buffer.from(p[2]), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let payload; try { payload = JSON.parse(Buffer.from(p[1], 'base64url').toString()) } catch { return null }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
  return payload
}

// ── Refresh token (opaque + 쿠키) ──
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex')
async function issueRefresh(res, userId, family) {
  const token = crypto.randomBytes(32).toString('hex')
  const fam = family || crypto.randomBytes(8).toString('hex')
  await store.addRefresh({ tokenHash: hashToken(token), userId, family: fam, expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(), revoked: false, createdAt: new Date().toISOString() })
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${REFRESH_COOKIE}=${token}; HttpOnly; Path=/api/auth; Max-Age=${REFRESH_TTL_MS / 1000}; SameSite=Strict${secure}`)
  return fam
}
function clearRefreshCookie(res) {
  res.setHeader('Set-Cookie', `${REFRESH_COOKIE}=; HttpOnly; Path=/api/auth; Max-Age=0; SameSite=Strict`)
}
function parseCookies(req) {
  const out = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone || null, department: u.department || null, permissions: permsForRole(u.role) })

// ── 미들웨어 ──
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  const payload = token && verifyAccess(token)
  if (!payload) return res.status(401).json({ ok: false, errorCode: 'UNAUTHORIZED', message: '로그인이 필요합니다.' })
  req.user = { id: payload.sub, email: payload.email, role: payload.role }
  next()
}

// ── 프로덕션 시크릿 가드 ── 기본값으로 배포하면 JWT 위조/기본계정 탈취 → 부팅 거부
export function assertAuthConfig() {
  const prod = process.env.NODE_ENV === 'production'
  const usingDefaultSecret = !process.env.AUTH_ACCESS_SECRET || process.env.AUTH_ACCESS_SECRET === 'dev-access-secret-change-me'
  const usingDefaultPw = !process.env.SEED_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD === 'ssc-demo-1234'
  if (prod) {
    const fatal = []
    if (usingDefaultSecret) fatal.push('AUTH_ACCESS_SECRET (미설정/기본값 → JWT 위조 위험)')
    if (usingDefaultPw) fatal.push('SEED_ADMIN_PASSWORD (기본값 → 기본 관리자 탈취)')
    if (fatal.length) {
      console.error(`[auth] FATAL: 프로덕션 배포 차단 — 다음을 env로 설정하세요:\n  - ${fatal.join('\n  - ')}`)
      process.exit(1)
    }
  } else if (usingDefaultSecret) {
    console.warn('[auth] 경고: AUTH_ACCESS_SECRET 기본값 사용 중 — 개발 전용. 프로덕션에서는 반드시 교체.')
  }
}

// ── 기본 사용자 시드 ──
export async function seedDefaultUser() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@ssc.local').toLowerCase()
  if (await store.getUserByEmail(email)) return
  const pw = process.env.SEED_ADMIN_PASSWORD || 'ssc-demo-1234'
  await store.addUser({ id: 'usr-admin', email, name: '파트너 관리자', role: 'admin', passwordHash: hashPassword(pw) })
  console.log(`[auth] 기본 사용자 시드: ${email} / ${pw}  (SEED_ADMIN_EMAIL·SEED_ADMIN_PASSWORD 로 변경)`)
}

// ── 라우터 ──
export const authRouter = express.Router()

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  const u = await store.getUserByEmail(email)
  if (!u || !verifyPassword(password, u.passwordHash)) {
    recordAudit({ kind: 'security', actor: String(email || '').trim().toLowerCase() || 'anon', action: '로그인 실패', target: '자격 증명 불일치', result: 'Failed', ip: req.ip })
    return res.status(401).json({ ok: false, errorCode: 'BAD_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' })
  }
  await issueRefresh(res, u.id)
  recordAudit({ kind: 'security', actor: u.email, role: u.role, action: '로그인', target: '세션 발급', result: 'OK', ip: req.ip })
  res.json({ ok: true, access: signAccess({ sub: u.id, email: u.email, role: u.role }), user: publicUser(u) })
})

authRouter.post('/refresh', async (req, res) => {
  const token = parseCookies(req)[REFRESH_COOKIE]
  if (!token) return res.status(401).json({ ok: false, errorCode: 'NO_REFRESH' })
  const rec = await store.findRefresh(hashToken(token))
  if (!rec) { clearRefreshCookie(res); return res.status(401).json({ ok: false, errorCode: 'BAD_REFRESH' }) }
  if (rec.revoked) { await store.revokeFamily(rec.family); clearRefreshCookie(res); return res.status(401).json({ ok: false, errorCode: 'REFRESH_REUSE', message: '재사용 감지 — 재로그인 필요' }) }
  if (Date.parse(rec.expiresAt) < Date.now()) { clearRefreshCookie(res); return res.status(401).json({ ok: false, errorCode: 'REFRESH_EXPIRED' }) }
  const u = await store.getUserById(rec.userId)
  if (!u) { clearRefreshCookie(res); return res.status(401).json({ ok: false }) }
  await store.revokeToken(rec.tokenHash) // 회전: 이전 것 폐기 후 새 것 발급(같은 family)
  await issueRefresh(res, u.id, rec.family)
  res.json({ ok: true, access: signAccess({ sub: u.id, email: u.email, role: u.role }), user: publicUser(u) })
})

authRouter.post('/logout', async (req, res) => {
  const token = parseCookies(req)[REFRESH_COOKIE]
  if (token) {
    const rec = await store.findRefresh(hashToken(token))
    if (rec) {
      await store.revokeFamily(rec.family)
      const u = await store.getUserById(rec.userId).catch(() => null)
      recordAudit({ kind: 'security', actor: u?.email || 'session', role: u?.role || null, action: '로그아웃', target: '세션 종료', result: 'OK', ip: req.ip })
    }
  }
  clearRefreshCookie(res)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const u = await store.getUserById(req.user.id)
  if (!u) return res.status(401).json({ ok: false })
  res.json({ ok: true, user: publicUser(u) })
})

// ── 사용자 관리 (관리자 전용) ──
authRouter.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ ok: true, users: (await store.listUsers()).map(publicUser) })
})

authRouter.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const { email, password, name, role, phone, department } = req.body || {}
  const em = String(email || '').trim().toLowerCase()
  if (!em || !password || String(password).length < 8) return res.status(400).json({ ok: false, errorCode: 'BAD_INPUT', message: '이메일과 8자 이상 비밀번호가 필요합니다.' })
  if (await store.getUserByEmail(em)) return res.status(409).json({ ok: false, errorCode: 'DUPLICATE', message: '이미 존재하는 이메일입니다.' })
  const u = { id: `usr-${crypto.randomBytes(6).toString('hex')}`, email: em, name: name || em, role: normalizeRole(role), phone: (phone || '').trim() || null, department: (department || '').trim() || null, passwordHash: hashPassword(password) }
  await store.addUser(u)
  res.json({ ok: true, user: publicUser(u) })
})

// 사용자 정보 수정 (관리자 전용) — 이름·연락처·소속부서. 이메일(식별자)·역할은 변경 안 함(역할은 /role).
authRouter.patch('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const target = await store.getUserById(req.params.id)
  if (!target) return res.status(404).json({ ok: false, message: '사용자 없음' })
  const patch = {}
  if (typeof req.body?.name === 'string') patch.name = req.body.name.trim() || target.name
  if (typeof req.body?.phone === 'string') patch.phone = req.body.phone.trim() || null
  if (typeof req.body?.department === 'string') patch.department = req.body.department.trim() || null
  const u = await store.updateUser(target.id, patch)
  res.json({ ok: true, user: publicUser(u) })
})

authRouter.patch('/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const role = normalizeRole(req.body?.role)
  const target = await store.getUserById(req.params.id)
  if (!target) return res.status(404).json({ ok: false, message: '사용자 없음' })
  // 마지막 관리자 강등 방지(자기 자신 포함)
  if (target.role === 'admin' && role !== 'admin' && (await store.adminCount()) <= 1) {
    return res.status(400).json({ ok: false, errorCode: 'LAST_ADMIN', message: '마지막 관리자는 강등할 수 없습니다.' })
  }
  const u = await store.updateUser(target.id, { role })
  res.json({ ok: true, user: publicUser(u) })
})
