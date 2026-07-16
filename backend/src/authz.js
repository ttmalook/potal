// =====================================================================
// 인가(AuthZ) — 역할 기반(RBAC) 권한 매트릭스 + 미들웨어
//  - 역할 3종: admin / partner / viewer
//  - 백엔드가 권한의 단일 소스(진짜 방어선). 프론트는 permsForRole()를 거울처럼 반영.
//  - requireAuth 뒤에서 사용(req.user = {id,email,role}).
// =====================================================================
import { recordAudit } from './auditStore.js'

export const ROLES = ['admin', 'partner', 'viewer']
export const normalizeRole = (r) => (ROLES.includes(r) ? r : 'partner')

// 권한 매트릭스(단일 소스): 리소스 → 액션(read|write) → 허용 역할
//  - 운영 리소스: admin/partner=read+write, viewer=read-only
//  - 관리 리소스: admin 전용
export const PERMISSIONS = {
  customers: { read: ['admin', 'partner', 'viewer'], write: ['admin', 'partner'] },
  domains: { read: ['admin', 'partner', 'viewer'], write: ['admin', 'partner'] },
  findings: { read: ['admin', 'partner', 'viewer'], write: ['admin', 'partner'] },
  labs: { read: ['admin', 'partner', 'viewer'], write: ['admin', 'partner'] },
  guides: { read: ['admin', 'partner', 'viewer'], write: ['admin', 'partner'] },
  evidence: { read: ['admin', 'partner', 'viewer'], write: ['admin', 'partner'] },
  settings: { read: ['admin'], write: ['admin'] },
  users: { read: ['admin'], write: ['admin'] },
  labStudio: { read: ['admin'], write: ['admin'] }
}

export const isAdmin = (req) => req.user?.role === 'admin'

export const hasPerm = (role, resource, action) => {
  const r = PERMISSIONS[resource]
  return !!(r && r[action] && r[action].includes(role))
}

// 역할의 전체 권한을 {resource: {read, write}} boolean 맵으로 — 프론트 미러용(백엔드가 단일 소스)
export const permsForRole = (role) => Object.fromEntries(
  Object.entries(PERMISSIONS).map(([res, a]) => [res, { read: a.read.includes(role), write: a.write.includes(role) }])
)

// 라우트 인가 미들웨어 — 매트릭스 기반
export function requirePerm(resource, action) {
  return (req, res, next) => {
    if (hasPerm(req.user?.role, resource, action)) return next()
    // 보안 이벤트: 권한 거부 기록(비차단)
    recordAudit({ kind: 'security', actor: req.user?.email || 'anon', role: req.user?.role || null, action: '권한 거부', target: `${resource}:${action} ${req.method} ${req.originalUrl}`, result: 'Denied', ip: req.ip })
    res.status(403).json({ ok: false, errorCode: 'FORBIDDEN', message: '이 작업을 수행할 권한이 없습니다.' })
  }
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ ok: false, errorCode: 'FORBIDDEN', message: '관리자 권한이 필요합니다.' })
  next()
}

// 생성 시 소유자 스탬프(메타/감사용 — 접근 격리에는 미사용)
export const stampOwner = (req, obj) => ({ ...(obj || {}), ownerId: (obj && obj.ownerId) || req.user?.id || null })

// 역할 기반 공유 읽기 — 인증된 모든 역할이 동일 운영 데이터를 열람(소유자 격리 아님).
// 쓰기 권한은 requirePerm(resource, 'write')로 별도 통제.
export const visibleTo = (_req, list) => (list || [])
