// =====================================================================
// 조치 가이드 "해석" — 프론트 공용 캐시 + 예열
//  - loadInterpretation(key): 세션 캐시 우선 → 백엔드(/api/guides/interpret, 백엔드도 캐시)
//  - prewarmInterpretations(keys): SSC 수집 시 등장 유형을 백그라운드로 미리 채움(비블로킹)
//  - why 없는 유형(steps 전용 등)은 null → 드로어에서 해석 섹션 생략(기술 why 폴백)
// =====================================================================
import { interpretGuide } from './portalApi.js'
import { getRemediationGuide } from '../data/remediationSteps.js'
import { catalogNameKo } from '../data/sandboxCatalog.js'

const cache = new Map()   // key → text
const inflight = new Map() // key → Promise (중복 요청 dedup)
const norm = (k) => String(k || '').toLowerCase().replace(/_v\d+$/, '')

export function cachedInterpretation(key) {
  return cache.get(norm(key)) || null
}

export function loadInterpretation(key) {
  const k = norm(key)
  if (cache.has(k)) return Promise.resolve(cache.get(k))
  if (inflight.has(k)) return inflight.get(k)
  const g = getRemediationGuide(k)
  if (!g.why) return Promise.resolve(null) // 해석 대상 아님
  const p = interpretGuide({ key: k, name: catalogNameKo(k), why: g.why })
    .then((text) => { if (text) cache.set(k, text); return text || null })
    .catch(() => null)
    .finally(() => inflight.delete(k))
  inflight.set(k, p)
  return p
}

// ── 조치 해석 (SSC 공식 조치 방법 원문 → 쉬운 한국어) ──
const remCache = new Map()
const remInflight = new Map()
export function cachedRemediation(key) { return remCache.get(norm(key)) || null }
export function loadRemediationInterpretation(key, sscRec, name) {
  const k = norm(key)
  const src = String(sscRec || '').trim()
  if (!k || !src) return Promise.resolve(null)
  if (remCache.has(k)) return Promise.resolve(remCache.get(k))
  if (remInflight.has(k)) return remInflight.get(k)
  const p = interpretGuide({ key: k, name, text: src, kind: 'remediation' })
    .then((text) => { if (text) remCache.set(k, text); return text || null })
    .catch(() => null)
    .finally(() => remInflight.delete(k))
  remInflight.set(k, p)
  return p
}

// SSC 수집 결과의 distinct 유형을 백그라운드 예열(fire-and-forget).
// 순차 실행 — 로컬 Ollama(CPU, 단일 처리)를 동시 다건으로 폭주시키지 않아 인터랙티브 요청(드로어 해석)이 큐에서 밀리지 않게 함.
export async function prewarmInterpretations(keys) {
  const uniq = [...new Set((keys || []).map(norm).filter(Boolean))]
  for (const k of uniq) {
    if (cache.has(k) || inflight.has(k)) continue
    if (!getRemediationGuide(k).why) continue
    try { await loadInterpretation(k) } catch { /* 예열 실패 무시 */ }
  }
}
