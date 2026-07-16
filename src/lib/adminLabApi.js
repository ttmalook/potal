// =====================================================================
// SSC AI Lab Builder — 관리자 API 클라이언트 (모두 /api/admin/* · requireAdmin)
//  공용 call() 사용(Bearer + 401 refresh). 파트너/비인증은 403/401.
// =====================================================================
import { call } from './apiCall.js'

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

export const fetchLabCoverage = () => call('/api/admin/lab-coverage')
export const classifyLabIssue = (issueType) => call('/api/admin/lab-classify', json('POST', { issueType }))
export const compileLabRecipe = (issueType) => call('/api/admin/lab-recipes/compile', json('POST', { issueType }))
export const gateLabRecipe = (id) => call(`/api/admin/lab-recipes/${encodeURIComponent(id)}/gate`, json('POST'))
export const adoptLabRecipe = (id) => call(`/api/admin/lab-recipes/${encodeURIComponent(id)}/adopt`, json('POST'))
export const listLabRecipes = () => call('/api/admin/lab-recipes').then((d) => d.recipes)
export const deleteLabRecipe = (id) => call(`/api/admin/lab-recipes/${encodeURIComponent(id)}`, json('DELETE'))

export const claudeKeyStatus = () => call('/api/settings/claude-key').then((d) => d.status)
export const setClaudeKey = (key) => call('/api/settings/claude-key', json('PUT', { key })).then((d) => d.status)
export const clearClaudeKey = () => call('/api/settings/claude-key', json('DELETE')).then((d) => d.status)
