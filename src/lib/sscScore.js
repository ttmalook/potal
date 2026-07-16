// =====================================================================
// SSC 점수/등급 조회 (도메인 단위) — 화면 간 공용 캐시
//  - sscSummary(host) → { score, grade }. scorecardId 등 식별자는 사용하지 않음.
//  - 결과: {score,grade} | null(범위 밖/조회 실패). 도메인별 1회만 호출(캐시).
// =====================================================================
import { useEffect, useState } from 'react'
import { sscSummary } from './sscApi.js'

const cache = new Map() // domain -> {score,grade} | null | Promise

export function getScore(domain) {
  if (!domain) return Promise.resolve(null)
  const hit = cache.get(domain)
  if (hit !== undefined) return hit instanceof Promise ? hit : Promise.resolve(hit)
  const p = sscSummary(domain)
    .then((d) => {
      const s = { score: d?.summary?.score ?? null, grade: d?.summary?.grade ?? null }
      const val = s.score == null && s.grade == null ? null : s
      cache.set(domain, val)
      return val
    })
    .catch(() => { cache.set(domain, null); return null })
  cache.set(domain, p)
  return p
}

// React 훅: undefined=로딩중, null=없음, {score,grade}=조회됨
export function useScore(domain) {
  const cached = cache.get(domain)
  const [state, setState] = useState(cached && !(cached instanceof Promise) ? cached : undefined)
  useEffect(() => {
    let alive = true
    if (!domain) { setState(null); return }
    getScore(domain).then((v) => { if (alive) setState(v) })
    return () => { alive = false }
  }, [domain])
  return state
}
