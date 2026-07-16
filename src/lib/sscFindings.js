// =====================================================================
// SSC 리스크 요약(issueTypeSummary) 캐시 — 도메인 단위, 화면·창 간 공유
//  - 목적: 한 번 조회한 리스크 요약을 재사용해 지연·SSC 토큰 비용 절약.
//  - 저장: 메모리 Map + localStorage(창 간 공유 · 새 창 리포트 뷰어가 재사용).
//  - TTL: 30분(리스크는 자주 바뀌지 않음). 만료 시 재조회.
// =====================================================================
import { collectRiskFindings } from './sscApi.js'

const TTL_MS = 30 * 60 * 1000
const LS_PREFIX = 'ssc-its:'
const mem = new Map() // domain -> { s: summary[], t: ts } | Promise

function readLS(domain) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + domain)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || !Array.isArray(o.s) || typeof o.t !== 'number') return null
    if (Date.now() - o.t > TTL_MS) return null
    return o
  } catch { return null }
}
function writeLS(domain, rec) {
  try { localStorage.setItem(LS_PREFIX + domain, JSON.stringify(rec)) } catch { /* quota/차단 무시 */ }
}

// 다른 조회부(리스크 점검 등)가 이미 받아온 요약을 캐시에 심어 재사용 가능하게 함.
export function primeIssueTypeSummary(domain, summary) {
  if (!domain || !Array.isArray(summary)) return
  const rec = { s: summary, t: Date.now() }
  mem.set(domain, rec)
  writeLS(domain, rec)
}

// 캐시 우선 조회: 메모리 → localStorage(신선) → 없으면 collectRiskFindings 1회 후 캐시.
export function getIssueTypeSummary(domain) {
  if (!domain) return Promise.resolve([])
  const hit = mem.get(domain)
  if (hit) {
    if (hit instanceof Promise) return hit
    if (Date.now() - hit.t <= TTL_MS) return Promise.resolve(hit.s)
  }
  const ls = readLS(domain)
  if (ls) { mem.set(domain, ls); return Promise.resolve(ls.s) }
  const p = collectRiskFindings(domain, { limit: 100, offset: 0, includeInfo: false })
    .then((d) => {
      const s = d?.issueTypeSummary || []
      const rec = { s, t: Date.now() }
      mem.set(domain, rec); writeLS(domain, rec)
      return s
    })
    .catch((e) => { mem.delete(domain); throw e })
  mem.set(domain, p)
  return p
}
