// =====================================================================
// Claude API 얇은 클라이언트 — AI Recipe Compiler 전용.
//  · 내장 fetch/AbortController. npm 의존성 없음.
//  · 키: 관리자 설정(settingsStore) > .env(ANTHROPIC_API_KEY). 응답/로그에 키 미노출.
//  · CLAUDE_MODEL 은 env 우선(관리자가 접근 가능한 모델로 교체). 모델 오류는 명확한 코드로.
// =====================================================================
import { claudeKeyOverride } from './settingsStore.js'

const BASE = process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com'
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8' // env 로 교체 가능
const TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 60000)
const MAX_TOKENS = Number(process.env.CLAUDE_MAX_TOKENS || 4096)

function apiKey() { return claudeKeyOverride() || process.env.ANTHROPIC_API_KEY || '' }
export function claudeConfigured() { return !!apiKey() }
export function claudeModel() { return MODEL }

export async function callClaude(system, user, { model = MODEL, maxTokens = MAX_TOKENS, temperature = 0.2 } = {}) {
  const key = apiKey()
  if (!key) throw Object.assign(new Error('Claude API 키가 설정되지 않았습니다.'), { code: 'CLAUDE_NOT_CONFIGURED' })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages: [{ role: 'user', content: user }] }),
      signal: ctrl.signal
    })
  } catch (e) {
    if (e.name === 'AbortError') throw Object.assign(new Error('Claude API 시간 초과'), { code: 'CLAUDE_TIMEOUT' })
    throw Object.assign(new Error('Claude API 연결 실패'), { code: 'CLAUDE_UNREACHABLE' })
  } finally { clearTimeout(timer) }
  if (!res.ok) {
    let detail = ''
    try { const j = await res.json(); detail = j?.error?.message || '' } catch { /* noop */ }
    const codeMap = { 401: 'CLAUDE_UNAUTHORIZED', 403: 'CLAUDE_UNAUTHORIZED', 429: 'CLAUDE_RATE_LIMITED', 400: 'CLAUDE_BAD_REQUEST', 404: 'CLAUDE_MODEL_INVALID' }
    throw Object.assign(new Error(`Claude API 오류 (HTTP ${res.status})${detail ? ': ' + detail.slice(0, 120) : ''}`), { code: codeMap[res.status] || `CLAUDE_HTTP_${res.status}` })
  }
  const j = await res.json().catch(() => null)
  const text = (j?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  if (!text) throw Object.assign(new Error('Claude 빈 응답'), { code: 'CLAUDE_EMPTY' })
  return { text, model, usage: j?.usage || null }
}
