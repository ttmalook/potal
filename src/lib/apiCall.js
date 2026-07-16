// =====================================================================
// 공통 API 호출 — access 토큰 부착 + 401 시 refresh 1회 재시도(단일 비행)
//  - /api/auth·/api/public 은 재시도 제외(로그인/공개 게시)
// =====================================================================
import { getAccessToken, refreshSession } from './auth.js'

const BASE = import.meta.env.VITE_BACKEND_URL || '' // 비어있으면 vite proxy(/api)

// 단일 비행 refresh(auth.js) 재사용 — 실패는 false로 흡수
const tryRefresh = () => refreshSession().then(() => true).catch(() => false)

function withAuth(opts = {}) {
  const t = getAccessToken()
  return t ? { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` } } : opts
}

export async function call(path, opts = {}) {
  const doFetch = () => fetch(BASE + path, withAuth(opts))
  let resp
  try {
    resp = await doFetch()
  } catch {
    const err = new Error('Backend에 연결할 수 없습니다. Backend 서버가 실행 중인지 확인하세요.')
    err.payload = { ok: false, errorCode: 'BACKEND_UNREACHABLE', message: err.message }
    err.code = 'BACKEND_UNREACHABLE'
    throw err
  }

  // access 만료 → refresh 1회 후 재요청 (로그인/공개 경로 제외)
  if (resp.status === 401 && !path.startsWith('/api/auth') && !path.startsWith('/api/public')) {
    const ok = await tryRefresh()
    if (ok) { try { resp = await doFetch() } catch { /* 아래 오류 처리로 */ } }
  }

  let data = null
  try { data = await resp.json() } catch { data = null }
  if (!resp.ok || data?.ok === false) {
    let payload = data
    if (!payload) {
      payload = resp.status >= 500
        ? { ok: false, errorCode: 'BACKEND_UNREACHABLE', message: 'Backend에 연결할 수 없습니다. Backend 서버(포트 8787)가 실행 중인지 확인하세요.' }
        : { ok: false, errorCode: 'HTTP_ERROR', message: `요청 실패 (HTTP ${resp.status})` }
    }
    const err = new Error(payload.message || `요청 실패 (HTTP ${resp.status})`)
    err.payload = payload
    err.code = payload.errorCode
    err.status = resp.status
    throw err
  }
  return data
}
