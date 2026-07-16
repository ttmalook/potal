// =====================================================================
// Frontend 인증 — access 토큰은 메모리에만(localStorage 금지, XSS 방어)
//  - refresh 토큰은 httpOnly 쿠키(백엔드가 관리, JS 접근 불가)
//  - 새로고침 시 access는 사라지므로 refresh()로 무음 복원
// =====================================================================
const BASE = import.meta.env.VITE_BACKEND_URL || ''

let accessToken = null
let currentUser = null

export const getAccessToken = () => accessToken
export const getUser = () => currentUser
export function setAuth(access, user) { accessToken = access ?? null; currentUser = user ?? null }
export function clearAuth() { accessToken = null; currentUser = null }

async function post(path, body) {
  const resp = await fetch(BASE + path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include' // refresh 쿠키 송수신
  })
  let data = null
  try { data = await resp.json() } catch { data = null }
  if (!resp.ok || data?.ok === false) {
    const err = new Error(data?.message || `요청 실패 (HTTP ${resp.status})`)
    err.payload = data; err.status = resp.status
    throw err
  }
  return data
}

export async function login(email, password) {
  const d = await post('/api/auth/login', { email, password })
  setAuth(d.access, d.user)
  return d.user
}
export async function logout() {
  try { await post('/api/auth/logout') } catch { /* 무시 */ }
  clearAuth()
}
// 세션 복원/갱신 — 단일 비행(StrictMode 이중 호출·동시 401에도 refresh 1회만 →
// 회전 토큰 재사용 오탐 방지). 성공 시 access 세팅, 실패(무세션) 시 throw.
let refreshing = null
export function refreshSession() {
  if (!refreshing) {
    refreshing = post('/api/auth/refresh')
      .then((d) => { setAuth(d.access, d.user); return d.user })
      .finally(() => { refreshing = null })
  }
  return refreshing
}
