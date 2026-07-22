// =====================================================================
// Portal Store API 클라이언트 (고객사/도메인 영구 저장)
//  - 우리 백엔드(/api/portal/*)만 호출. 성공 시 실제 파일 저장소에 영속.
//  - 백엔드 미실행 시 throw → App이 로컬(mock) 모드로 폴백.
// =====================================================================
import { call } from './apiCall.js'

const jsonOpts = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
})

export const fetchCustomers = () => call('/api/portal/customers').then((d) => d.customers)
export const fetchDomains = () => call('/api/portal/domains').then((d) => d.domains)

export const apiAddCustomer = (c) => call('/api/portal/customers', jsonOpts('POST', c)).then((d) => d.customer)
export const apiUpdateCustomer = (id, patch) => call(`/api/portal/customers/${encodeURIComponent(id)}`, jsonOpts('PUT', patch)).then((d) => d.customer)
export const apiDeleteCustomer = (id) => call(`/api/portal/customers/${encodeURIComponent(id)}`, jsonOpts('DELETE'))

export const apiAddDomain = (d) => call('/api/portal/domains', jsonOpts('POST', d)).then((r) => r.domain)
export const apiUpdateDomain = (id, patch) => call(`/api/portal/domains/${encodeURIComponent(id)}`, jsonOpts('PUT', patch)).then((r) => r.domain)
export const apiDeleteDomain = (id) => call(`/api/portal/domains/${encodeURIComponent(id)}`, jsonOpts('DELETE'))

export const fetchEvidencePacks = () => call('/api/portal/evidence-packs').then((d) => d.evidencePacks)
export const apiAddEvidencePack = (p) => call('/api/portal/evidence-packs', jsonOpts('POST', p)).then((d) => d.evidencePack)
export const apiUpdateEvidencePack = (id, patch) => call(`/api/portal/evidence-packs/${encodeURIComponent(id)}`, jsonOpts('PUT', patch)).then((d) => d.evidencePack)
export const apiDeleteEvidencePack = (id) => call(`/api/portal/evidence-packs/${encodeURIComponent(id)}`, jsonOpts('DELETE'))
// 공개(무인증) 게시 팩 조회 — 발행된 팩만 토큰으로 반환
export const fetchSharedPack = (token) => call(`/api/public/shared/${encodeURIComponent(token)}`).then((d) => d.pack)

// 감사 로그(관리자 전용) — kind: all|user|security|system
export const fetchAudit = (params = {}) => {
  const q = new URLSearchParams()
  if (params.kind && params.kind !== 'all') q.set('kind', params.kind)
  if (params.limit != null) q.set('limit', String(params.limit))
  if (params.offset != null) q.set('offset', String(params.offset))
  return call(`/api/audit${q.toString() ? `?${q}` : ''}`).then((d) => ({ items: d.items || [], total: d.total || 0 }))
}

// 조치 가이드 "해석"(쉬운말) — 로컬 LLM 생성/캐시. 실패·미지원 시 null(프론트가 기술 why로 폴백)
export const interpretGuide = (body) => call('/api/guides/interpret', jsonOpts('POST', body)).then((d) => d?.text || null).catch(() => null)

// 사용자 관리 (관리자 전용 — 서버가 403 처리)
export const fetchUsers = () => call('/api/auth/users').then((d) => d.users)
export const apiCreateUser = (body) => call('/api/auth/users', jsonOpts('POST', body)).then((d) => d.user)
export const apiSetUserRole = (id, role) => call(`/api/auth/users/${encodeURIComponent(id)}/role`, jsonOpts('PATCH', { role })).then((d) => d.user)
// 비밀번호 — 본인 변경(현재 비밀번호 필요) · 관리자 재설정
export const apiChangeMyPassword = (currentPassword, newPassword) =>
  call('/api/auth/me/password', jsonOpts('POST', { currentPassword, newPassword }))
// 세션(로그인 기기) 관리 — 본인 세션 목록/원격 폐기 (N-03)
export const fetchSessions = () => call('/api/auth/sessions').then((d) => d.sessions || [])
export const apiRevokeSession = (family) => call(`/api/auth/sessions/${encodeURIComponent(family)}`, jsonOpts('DELETE'))
export const apiRevokeOtherSessions = () => call('/api/auth/sessions/revoke-others', jsonOpts('POST'))
export const apiResetUserPassword = (id, newPassword) =>
  call(`/api/auth/users/${encodeURIComponent(id)}/password`, jsonOpts('PATCH', { newPassword }))
export const apiUpdateUser = (id, patch) => call(`/api/auth/users/${encodeURIComponent(id)}`, jsonOpts('PATCH', patch)).then((d) => d.user)
// SSC API 토큰 (관리자 전용) — 값은 반환되지 않음(상태만: configured/source/hint)
export const sscTokenStatus = () => call('/api/settings/ssc-token').then((d) => d.status)
export const sscTokenSet = (token) => call('/api/settings/ssc-token', jsonOpts('PUT', { token })).then((d) => d.status)
export const sscTokenClear = () => call('/api/settings/ssc-token', jsonOpts('DELETE')).then((d) => d.status)
// 추측 불가 공유 토큰 생성 (게시 링크용)
export const genShareToken = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)
// 게시 링크 만료 시각 (기본 30일)
export const shareExpiryFromNow = (days = 30) => new Date(Date.now() + days * 86400000).toISOString()
// 게시 토큰+만료 한 번에
export const newShareFields = () => ({ shareToken: genShareToken(), shareExpiresAt: shareExpiryFromNow() })
