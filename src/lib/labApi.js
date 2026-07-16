// =====================================================================
// Validation Sandbox (Partner Lab PoC) API 클라이언트
//  - 우리 백엔드(/api/lab/*)만 호출. 참고용 PoC 증적 생성/조회.
//  - 공용 apiCall(call) 사용: access 토큰(Bearer) 부착 + 401 시 refresh 1회 재시도.
//    (/api/lab 은 requireAuth 보호 → 인증 헤더가 없으면 401 "로그인이 필요합니다".)
// =====================================================================
import { call } from './apiCall.js'

export const getLabTemplates = () => call('/api/lab/templates').then((d) => d.templates)
export const listLabRuns = () => call('/api/lab/runs').then((d) => d.runs)
export const getLabRun = (id) => call(`/api/lab/runs/${encodeURIComponent(id)}`).then((d) => d.run)
export const runLabPoC = (body) =>
  call('/api/lab/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((d) => d.run)
// 참고용 PoC run 정리(관리자 전용) — 단건/벌크 삭제
export const deleteLabRun = (id) => call(`/api/lab/runs/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const deleteLabRuns = (ids) =>
  call('/api/lab/runs/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).then((d) => d.deleted)
