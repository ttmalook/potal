// =====================================================================
// SecurityScorecard API 클라이언트
// - API Token은 이 모듈(서버) 안에서만 사용됩니다.
// - Token은 로그/응답/에러 어디에도 노출하지 않습니다.
// =====================================================================
import 'dotenv/config'
import { sscTokenOverride } from './settingsStore.js'

const BASE_URL = (process.env.SECURITYSCORECARD_API_BASE_URL || 'https://api.securityscorecard.io').replace(/\/$/, '')
const ENV_TOKEN = process.env.SSC_API_TOKEN || process.env.SECURITYSCORECARD_API_TOKEN || ''
const PLACEHOLDER = 'replace-with-real-token'
// 관리자 설정(메모리 오버라이드) 우선, 없으면 env
function activeToken() { return sscTokenOverride() || ENV_TOKEN }

export function tokenConfigured() {
  const t = activeToken()
  return Boolean(t && t !== PLACEHOLDER)
}
export function getBaseUrl() {
  return BASE_URL
}

// HTTP status → 사용자 친화 에러 코드/메시지 매핑
export function errorFromStatus(status) {
  switch (status) {
    case 401:
      return { ok: false, errorCode: 'SSC_UNAUTHORIZED', message: 'API Token이 유효하지 않습니다. Backend .env의 SECURITYSCORECARD_API_TOKEN을 확인하세요.', details: null }
    case 403:
      return { ok: false, errorCode: 'SSC_FORBIDDEN', message: '해당 도메인에 대한 SecurityScorecard 접근 권한이 없거나 Portfolio에 포함되어 있지 않습니다.', details: null }
    case 404:
      return { ok: false, errorCode: 'SSC_NOT_FOUND', message: '해당 도메인의 Scorecard를 찾을 수 없거나 도메인이 등록되어 있지 않습니다.', details: null }
    case 429:
      return { ok: false, errorCode: 'SSC_RATE_LIMITED', message: 'SecurityScorecard API 요청 한도(Rate Limit)를 초과했습니다. 잠시 후 다시 시도하세요.', details: null }
    default:
      if (status >= 500) return { ok: false, errorCode: 'SSC_UPSTREAM_ERROR', message: 'SecurityScorecard API 또는 네트워크 오류가 발생했습니다.', details: null }
      return { ok: false, errorCode: 'SSC_ERROR', message: `SecurityScorecard API 오류 (HTTP ${status}).`, details: null }
  }
}

export function httpStatusForError(errorCode) {
  const map = {
    SSC_UNAUTHORIZED: 401,
    SSC_FORBIDDEN: 403,
    SSC_NOT_FOUND: 404,
    SSC_RATE_LIMITED: 429,
    SSC_UPSTREAM_ERROR: 502,
    SSC_NETWORK_ERROR: 502,
    SSC_TOKEN_MISSING: 500,
    SSC_ERROR: 502
  }
  return map[errorCode] || 502
}

// SecurityScorecard GET 호출 (Authorization 헤더는 여기서만 부착)
export async function sscGet(path) {
  if (!tokenConfigured()) {
    return { ok: false, error: { ok: false, errorCode: 'SSC_TOKEN_MISSING', message: 'SecurityScorecard API Token이 설정되지 않았습니다. 사용자 관리(관리자)에서 SSC API 토큰을 등록하거나 backend/.env를 확인하세요.', details: null } }
  }
  const TOKEN = activeToken()
  const url = BASE_URL + path
  let resp
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Token ${TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
  } catch (e) {
    // 네트워크/DNS 오류 — 원본 메시지에 토큰이 포함될 수 없으나 방어적으로 요약만 반환
    return { ok: false, error: { ok: false, errorCode: 'SSC_NETWORK_ERROR', message: 'SecurityScorecard API에 연결할 수 없습니다. 네트워크 또는 Base URL을 확인하세요.', details: null } }
  }
  const text = await resp.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { _nonJson: true }
  }
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: errorFromStatus(resp.status) }
  }
  return { ok: true, status: resp.status, data }
}
