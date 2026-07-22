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
  // 프로덕션에서는 비밀번호를 로그에 남기지 않는다(컨테이너 로그 유출 방지).
  if (process.env.NODE_ENV === 'production') {
    console.log(`[auth] 기본 사용자 시드: ${email} (비밀번호는 SEED_ADMIN_PASSWORD 값 — 로그 미출력)`)
  } else {
    console.log(`[auth] 기본 사용자 시드: ${email} / ${pw}  (SEED_ADMIN_EMAIL·SEED_ADMIN_PASSWORD 로 변경)`)
  }
}

// ── 라우터 ──
export const authRouter = express.Router()

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [auth]
 *     summary: 로그인 — access 토큰 발급 + refresh 쿠키(ssc_rt) 설정
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: admin@demo.local }
 *               password: { type: string, format: password, example: demo-password }
 *     responses:
 *       200:
 *         description: 인증 성공 — access 토큰 + 사용자. refresh 토큰은 HttpOnly 쿠키로 설정됨.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 access: { type: string, description: JWT access 토큰(HS256) }
 *                 user: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
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

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [auth]
 *     summary: access 토큰 재발급 (refresh 쿠키 회전)
 *     description: HttpOnly refresh 쿠키(ssc_rt)로 새 access 토큰을 발급하고 refresh 를 회전한다. 재사용 감지 시 family 전체 폐기.
 *     security: []
 *     responses:
 *       200:
 *         description: 재발급 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 access: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
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

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [auth]
 *     summary: 로그아웃 — 현재 세션(refresh family) 폐기 + 쿠키 삭제
 *     security: []
 *     responses:
 *       200: { description: 로그아웃 완료, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean, example: true } } } } } }
 */
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

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [auth]
 *     summary: 현재 로그인 사용자 조회 (권한 포함)
 *     responses:
 *       200:
 *         description: 사용자 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 user: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
authRouter.get('/me', requireAuth, async (req, res) => {
  const u = await store.getUserById(req.user.id)
  if (!u) return res.status(401).json({ ok: false })
  res.json({ ok: true, user: publicUser(u) })
})

// ── 사용자 관리 (관리자 전용) ──
/**
 * @openapi
 * /api/auth/users:
 *   get:
 *     tags: [auth]
 *     summary: 사용자 목록 (관리자 전용)
 *     responses:
 *       200: { description: 사용자 목록(passwordHash 제외), content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, users: { type: array, items: { $ref: '#/components/schemas/User' } } } } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   post:
 *     tags: [auth]
 *     summary: 사용자 생성 (관리자 전용)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: partner@demo.local }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *               role: { type: string, enum: [admin, partner, viewer], example: partner }
 *               phone: { type: string, nullable: true }
 *               department: { type: string, nullable: true }
 *     responses:
 *       200: { description: 생성된 사용자, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, user: { $ref: '#/components/schemas/User' } } } } } }
 *       400: { description: 입력 오류(이메일 누락 또는 비밀번호 정책 위반 — 8자 이상·문자 3종 조합), content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: 이메일 중복, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
authRouter.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ ok: true, users: (await store.listUsers()).map(publicUser) })
})

authRouter.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const { email, password, name, role, phone, department } = req.body || {}
  const em = String(email || '').trim().toLowerCase()
  if (!em) return res.status(400).json({ ok: false, errorCode: 'BAD_INPUT', message: '이메일이 필요합니다.' })
  { const perr = passwordPolicyError(password); if (perr) return res.status(400).json({ ok: false, errorCode: 'WEAK_PASSWORD', message: perr }) }
  if (await store.getUserByEmail(em)) return res.status(409).json({ ok: false, errorCode: 'DUPLICATE', message: '이미 존재하는 이메일입니다.' })
  const u = { id: `usr-${crypto.randomBytes(6).toString('hex')}`, email: em, name: name || em, role: normalizeRole(role), phone: (phone || '').trim() || null, department: (department || '').trim() || null, passwordHash: hashPassword(password) }
  await store.addUser(u)
  res.json({ ok: true, user: publicUser(u) })
})

// 사용자 정보 수정 (관리자 전용) — 이름·연락처·소속부서. 이메일(식별자)·역할은 변경 안 함(역할은 /role).
/**
 * @openapi
 * /api/auth/users/{id}:
 *   patch:
 *     tags: [auth]
 *     summary: 사용자 정보 수정 (관리자 전용) — 이름·연락처·소속. 이메일·역할 불변
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               phone: { type: string, nullable: true }
 *               department: { type: string, nullable: true }
 *     responses:
 *       200: { description: 수정된 사용자, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, user: { $ref: '#/components/schemas/User' } } } } } }
 *       404: { description: 사용자 없음, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
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

// ── 비밀번호 ──
// 공통 정책: 8자 이상 + 문자 종류 3종 이상 조합 · 변경 시 해당 사용자의 refresh 세션 전부 폐기
//            · 감사 기록은 남기되 비밀번호 값은 절대 기록하지 않음.
const PW_MIN = 8
const PW_MSG = `비밀번호는 ${PW_MIN}자 이상, 대문자·소문자·숫자·특수문자 중 3종류 이상을 조합해야 합니다.`
// 정책 위반 시 메시지 반환, 통과 시 null.
function passwordPolicyError(pw) {
  const s = String(pw ?? '')
  if (s.length < PW_MIN) return PW_MSG
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(s)).length
  if (classes < 3) return PW_MSG
  return null
}

// 본인 변경 — 현재 비밀번호 검증 필수.
//  (세션이 탈취돼도 공격자가 비밀번호를 바꿔 계정을 영구 장악하지 못하게 하는 장치)
/**
 * @openapi
 * /api/auth/me/password:
 *   post:
 *     tags: [auth]
 *     summary: 본인 비밀번호 변경 (현재 비밀번호 검증 필수)
 *     description: 성공 시 해당 사용자의 refresh 세션 전부 폐기(다른 기기 강제 로그아웃). 비밀번호 값은 감사에 기록하지 않는다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: 변경됨(재로그인 필요), content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, message: { type: string } } } } } }
 *       400: { description: 현재 비밀번호 불일치/약한 비밀번호/동일 비밀번호, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
authRouter.post('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  const u = await store.getUserById(req.user.id)
  if (!u) return res.status(401).json({ ok: false })
  if (!verifyPassword(currentPassword, u.passwordHash)) {
    recordAudit({ kind: 'security', actor: u.email, role: u.role, action: '비밀번호 변경 실패', target: '현재 비밀번호 불일치', result: 'Failed', ip: req.ip })
    return res.status(400).json({ ok: false, errorCode: 'BAD_CURRENT_PASSWORD', message: '현재 비밀번호가 올바르지 않습니다.' })
  }
  { const perr = passwordPolicyError(newPassword); if (perr) return res.status(400).json({ ok: false, errorCode: 'WEAK_PASSWORD', message: perr }) }
  if (currentPassword === newPassword) {
    return res.status(400).json({ ok: false, errorCode: 'SAME_PASSWORD', message: '현재 비밀번호와 다른 값을 사용하세요.' })
  }
  await store.updateUser(u.id, { passwordHash: hashPassword(newPassword) })
  const revoked = await store.revokeAllForUser(u.id)
  clearRefreshCookie(res)
  recordAudit({ kind: 'security', actor: u.email, role: u.role, action: '비밀번호 변경', target: `세션 ${revoked}건 폐기`, result: 'OK', ip: req.ip })
  res.json({ ok: true, message: '비밀번호가 변경되었습니다. 다시 로그인하세요.' })
})

// 관리자 재설정 — 대상 사용자가 비밀번호를 잊은 경우. 현재 비밀번호 불필요.
/**
 * @openapi
 * /api/auth/users/{id}/password:
 *   patch:
 *     tags: [auth]
 *     summary: 관리자 비밀번호 재설정 (현재 비밀번호 불필요 · 관리자 전용)
 *     description: 대상 사용자의 refresh 세션 전부 폐기. 대상은 재로그인 필요.
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties: { newPassword: { type: string, minLength: 8 } }
 *     responses:
 *       200: { description: 재설정됨, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, message: { type: string } } } } } }
 *       400: { description: 약한 비밀번호, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: 사용자 없음, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
authRouter.patch('/users/:id/password', requireAuth, requireAdmin, async (req, res) => {
  const { newPassword } = req.body || {}
  const target = await store.getUserById(req.params.id)
  if (!target) return res.status(404).json({ ok: false, message: '사용자 없음' })
  { const perr = passwordPolicyError(newPassword); if (perr) return res.status(400).json({ ok: false, errorCode: 'WEAK_PASSWORD', message: perr }) }
  await store.updateUser(target.id, { passwordHash: hashPassword(newPassword) })
  const revoked = await store.revokeAllForUser(target.id)
  // 자기 자신을 재설정한 경우 현재 세션도 무효화
  if (target.id === req.user.id) clearRefreshCookie(res)
  recordAudit({ kind: 'security', actor: req.user.email, role: req.user.role, action: '비밀번호 재설정',
    target: `${target.email} · 세션 ${revoked}건 폐기`, result: 'OK', ip: req.ip })
  res.json({ ok: true, message: '비밀번호가 재설정되었습니다. 해당 사용자는 다시 로그인해야 합니다.' })
})

/**
 * @openapi
 * /api/auth/users/{id}/role:
 *   patch:
 *     tags: [auth]
 *     summary: 사용자 역할 변경 (관리자 전용)
 *     description: 마지막 관리자는 강등 불가(자기 자신 포함).
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties: { role: { type: string, enum: [admin, partner, viewer] } }
 *     responses:
 *       200: { description: 변경된 사용자, content: { application/json: { schema: { type: object, properties: { ok: { type: boolean }, user: { $ref: '#/components/schemas/User' } } } } } }
 *       400: { description: 마지막 관리자 강등 시도, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: 사용자 없음, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
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
