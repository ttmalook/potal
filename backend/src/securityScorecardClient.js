// =====================================================================
// SecurityScorecard API Client (연동 사전 검증용, read-only 중심)
// 설계 원칙:
//  - Token은 환경변수에서만 읽고, 로그/응답/에러 어디에도 노출하지 않는다.
//  - GET(read-only)만 실제 호출. POST/PUT/PATCH는 기본 dry-run.
//  - DELETE는 이 단계에서 절대 실제 실행하지 않는다(항상 시뮬레이션).
//  - 429는 Retry-After를 존중하고, 5xx는 백오프 재시도한다.
//  - Pagination은 응답 구조(entries/Link header)를 기준으로 안전 처리.
// =====================================================================
import 'dotenv/config'
import { sscTokenOverride } from './settingsStore.js'

// ---- 설정 (신규/구 환경변수 이름 모두 지원) --------------------------------
const BASE_URL = (
  process.env.SSC_API_BASE_URL ||
  process.env.SECURITYSCORECARD_API_BASE_URL ||
  'https://api.securityscorecard.io'
).replace(/\/$/, '')

const ENV_TOKEN = process.env.SSC_API_TOKEN || process.env.SECURITYSCORECARD_API_TOKEN || ''
const PLACEHOLDERS = ['replace-with-real-token', 'replace_with_real_token', '']
// 관리자 설정(메모리 오버라이드) 우선, 없으면 env. Authorization은 이 모듈 안에서만 부착.
function activeToken() { return sscTokenOverride() || ENV_TOKEN }

export const config = {
  baseUrl: BASE_URL,
  testDomain: process.env.SSC_TEST_DOMAIN || 'example.com',
  testPortfolioId: process.env.SSC_TEST_PORTFOLIO_ID || '',
  enableWriteTests: String(process.env.SSC_ENABLE_WRITE_TESTS || 'false').toLowerCase() === 'true',
  enableDeleteTests: String(process.env.SSC_ENABLE_DELETE_TESTS || 'false').toLowerCase() === 'true'
}

export function tokenConfigured() {
  const t = activeToken()
  return Boolean(t) && !PLACEHOLDERS.includes(t)
}

// ---- 보안: 토큰/Authorization 마스킹 ---------------------------------------
// 어떤 문자열에서도 토큰 값과 Authorization 헤더를 노출하지 않도록 마스킹.
export function maskSecrets(input) {
  let s = typeof input === 'string' ? input : JSON.stringify(input ?? null)
  for (const t of [activeToken(), ENV_TOKEN]) { if (t && t.length > 0) s = s.split(t).join('***REDACTED***') }
  s = s.replace(/(authorization\s*:\s*token\s+)\S+/gi, '$1***REDACTED***')
  s = s.replace(/(token\s+)[A-Za-z0-9._-]{8,}/g, '$1***REDACTED***')
  return s
}

// ---- HTTP status → 표준 에러 -----------------------------------------------
export function classifyStatus(status) {
  const table = {
    400: ['SSC_BAD_REQUEST', '잘못된 요청입니다. 파라미터/도메인 형식을 확인하세요.'],
    401: ['SSC_UNAUTHORIZED', 'API Token이 유효하지 않거나 누락/폐기되었습니다.'],
    403: ['SSC_FORBIDDEN', '해당 리소스에 대한 권한이 없거나 Feature/Portfolio 접근이 불가합니다.'],
    404: ['SSC_NOT_FOUND', '리소스를 찾을 수 없습니다(미등록 또는 권한 보호 목적의 Not Found).'],
    429: ['SSC_RATE_LIMITED', 'Rate Limit을 초과했습니다. Retry-After를 준수하세요.']
  }
  if (table[status]) return { errorCode: table[status][0], message: table[status][1] }
  if (status >= 500) return { errorCode: 'SSC_UPSTREAM_ERROR', message: 'SecurityScorecard 서버 오류입니다. 재시도가 필요합니다.' }
  return { errorCode: 'SSC_ERROR', message: `SecurityScorecard API 오류 (HTTP ${status}).` }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- 저수준 요청 (재시도/백오프 포함) --------------------------------------
async function rawRequest(method, path, { query, body, maxRetries = 2 } = {}) {
  if (!tokenConfigured()) {
    return { ok: false, status: 0, error: { errorCode: 'SSC_TOKEN_MISSING', message: 'SecurityScorecard API 토큰이 설정되지 않았습니다. 사용자 관리(관리자)에서 SSC API 토큰을 등록하거나 backend/.env를 확인하세요.' } }
  }
  const TOKEN = activeToken()
  const qs = query ? '?' + new URLSearchParams(query).toString() : ''
  const url = BASE_URL + path + qs

  let attempt = 0
  while (true) {
    let resp
    try {
      resp = await fetch(url, {
        method,
        headers: {
          Authorization: `Token ${TOKEN}`,
          Accept: 'application/json; charset=utf-8',
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      })
    } catch (e) {
      // 네트워크/DNS 오류 — 메시지는 마스킹 후 요약만
      return { ok: false, status: 0, error: { errorCode: 'SSC_NETWORK_ERROR', message: 'SecurityScorecard API에 연결할 수 없습니다.' } }
    }

    // 429 / 5xx 재시도
    if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
      const retryAfter = Number(resp.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : Math.min(500 * 2 ** attempt, 4000)
      attempt += 1
      await sleep(waitMs)
      continue
    }

    const text = await resp.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { _nonJson: true }
    }
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: classifyStatus(resp.status), retryAfter: resp.headers.get('retry-after') || null }
    }
    // Link header(페이지네이션) 노출 — 토큰 없음
    return { ok: true, status: resp.status, data, linkHeader: resp.headers.get('link') || null }
  }
}

// ---- 공개 메서드 -----------------------------------------------------------
// GET: 실제 호출 (read-only)
export function get(path, query) {
  return rawRequest('GET', path, { query })
}

// POST/PUT/PATCH: 기본 dry-run (SSC_ENABLE_WRITE_TESTS=true & dryRun:false 일 때만 실제 호출)
export async function write(method, path, { body, dryRun = true } = {}) {
  const m = method.toUpperCase()
  if (!['POST', 'PUT', 'PATCH'].includes(m)) {
    return { ok: false, error: { errorCode: 'SSC_METHOD_NOT_ALLOWED', message: `${m}는 write() 대상이 아닙니다.` } }
  }
  const wantsReal = dryRun === false && config.enableWriteTests
  if (!wantsReal) {
    return {
      ok: true,
      dryRun: true,
      method: m,
      path,
      wouldSend: body ?? null,
      note: 'dry-run: 실제 쓰기 호출을 수행하지 않았습니다. (SSC_ENABLE_WRITE_TESTS=true 이고 dryRun:false 일 때만 실행)'
    }
  }
  return rawRequest(m, path, { body })
}

// DELETE: 이 단계에서는 항상 시뮬레이션 (절대 실제 실행하지 않음)
export function del(path) {
  return {
    ok: true,
    simulated: true,
    method: 'DELETE',
    path,
    note: 'DELETE는 사전 검증 단계에서 실제 실행하지 않습니다(안전 가드). 실제 삭제는 별도 승인 절차 필요.'
  }
}

// ---- Pagination 유틸 -------------------------------------------------------
// entries[] 또는 Link header(rel="next") 기반으로 안전 수집. maxPages로 폭주 방지.
export async function collect(path, { query = {}, itemsKey, maxPages = 5, pageParam = 'page' } = {}) {
  const items = []
  let page = 1
  let pages = 0
  let next = null
  do {
    const q = next ? undefined : { ...query, [pageParam]: page }
    const res = next ? await rawRequest('GET', next.replace(BASE_URL, '')) : await rawRequest('GET', path, { query: q })
    if (!res.ok) return { ok: false, error: res.error, collected: items }
    const body = res.data
    const arr = Array.isArray(body) ? body : body?.[itemsKey || 'entries'] || body?.entries || []
    items.push(...arr)
    pages += 1
    // Link header rel="next" 우선, 없으면 페이지 증가 후 빈 배열이면 종료
    next = parseNextLink(res.linkHeader)
    page += 1
    if (!next && arr.length === 0) break
  } while ((next || false) && pages < maxPages)
  return { ok: true, items, pages }
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null
  const m = String(linkHeader)
    .split(',')
    .map((s) => s.trim())
    .find((s) => /rel="?next"?/.test(s))
  if (!m) return null
  const url = m.match(/<([^>]+)>/)
  return url ? url[1] : null
}
