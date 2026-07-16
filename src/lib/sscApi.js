// =====================================================================
// Frontend → 우리 Backend API 클라이언트
// - SecurityScorecard API Token은 여기서 절대 다루지 않습니다.
// - 브라우저는 오직 우리 Backend(/api/ssc/*)만 호출합니다.
// =====================================================================

import { call } from './apiCall.js'

export const SSC_MODE = import.meta.env.VITE_SSC_API_MODE || 'mock'
export const IS_BACKEND_MODE = SSC_MODE === 'backend'

export const sscHealth = () => call('/api/ssc/health')
export const sscSummary = (d) => call(`/api/ssc/company/${encodeURIComponent(d)}/summary`)
export const sscFactors = (d) => call(`/api/ssc/company/${encodeURIComponent(d)}/factors`)
export const sscIssues = (d) => call(`/api/ssc/company/${encodeURIComponent(d)}/issues`)
export const sscIssueTypes = () => call('/api/ssc/metadata/issue-types')
export const sscImportRisk = (body) =>
  call('/api/ssc/import-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

// Risk Findings Collector (read-only, factors-first). risk-findings.v1 스키마.
// scope-denied/rate-limited 등은 call()이 throw → 호출부에서 e.payload.errorCode로 분기.
export function collectRiskFindings(domain, opts = {}) {
  const p = new URLSearchParams()
  p.set('domain', domain)
  if (opts.limit != null) p.set('limit', String(opts.limit))
  if (opts.offset != null) p.set('offset', String(opts.offset))
  if (opts.severity) p.set('severity', Array.isArray(opts.severity) ? opts.severity.join(',') : opts.severity)
  if (opts.factor) p.set('factor', Array.isArray(opts.factor) ? opts.factor.join(',') : opts.factor)
  if (opts.includeInfo != null) p.set('includeInfo', String(opts.includeInfo))
  return call(`/api/integrations/securityscorecard/risk-findings/collect?${p.toString()}`)
}

// Backend Risk Finding → Risk Findings 테이블 row 형태로 어댑트
export function toTableFindings(findings) {
  return (findings || []).map((f, i) => ({
    id: f.id || `ssc-${i + 1}`,
    source: f.source || 'SecurityScorecard API',
    risk: f.findingType || f.issueType || 'SSC Finding',
    customer: f.customerName || '—',
    url: f.targetUrl || '',
    observed: [f.issueType, f.occurrenceCount ? `${f.occurrenceCount}건` : null].filter(Boolean).join(' · ') || 'SSC Finding',
    severity: f.severity || 'Low',
    difficulty: '—',
    evidence: f.evidenceStatus || 'Partner Lab Evidence Pending',
    guide: f.guideStatus || 'Draft Needed',
    delivery: f.deliveryStatus || 'Not Delivered',
    state: f.workflowState || 'SSC Risk Imported',
    isNew: true
  }))
}
