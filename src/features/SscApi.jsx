// =====================================================================
// SecurityScorecard API 연동 UI (Backend read-only smoke test)
// - SscBackendImport : Customers 화면의 "SSC Risk 가져오기" backend 모드
// - SscSmokeTest     : Partner Admin 내부용 API Smoke Test 패널 (Audit Log 하단)
// 토큰은 프론트에서 다루지 않으며, 우리 Backend만 호출합니다.
// =====================================================================
import React, { useEffect, useState } from 'react'
import {
  sscHealth,
  sscSummary,
  sscFactors,
  sscIssues,
  sscIssueTypes,
  sscImportRisk,
  collectRiskFindings,
  toTableFindings
} from '../lib/sscApi.js'
import { PrimaryButton, SecondaryButton, Field, NoticeBox, SeverityBadge, SourceBadge, EmptyState, DataTable, StatusBadge, Drawer } from '../components/common.jsx'
import { ENABLE_DEV_MOCKS } from '../config/runtime.js'
import { newShareFields } from '../lib/portalApi.js'
import { primeIssueTypeSummary } from '../lib/sscFindings.js'
import { prewarmInterpretations, loadRemediationInterpretation, cachedRemediation } from '../lib/interpret.js'
import { catalogEntry, catalogNameKo, factorNameKo, remediationKo, factorRemediationKo } from '../data/sandboxCatalog.js'
import * as devData from '../data/mock.js'
import { ComplianceRef } from '../components/ComplianceRef.jsx'

// ---------------------------------------------------------------------
// Customers — backend 모드 SSC Risk Import
// ---------------------------------------------------------------------
export function SscBackendImport({ customer, onImported, showToast }) {
  const [domain, setDomain] = useState(customer?.domain || '')
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const run = async () => {
    const d = domain.trim()
    if (!d) return
    setState('loading')
    setError(null)
    setResult(null)
    try {
      const res = await sscImportRisk({
        customerId: customer?.id,
        customerName: customer?.name,
        domain: d
      })
      const rows = toTableFindings(res.findings)
      setResult({ res, rows })
      setState('done')
      onImported?.(rows)
      showToast?.(`SSC API Import 완료 — ${rows.length}개 Risk Finding 생성됨 (read-only)`)
    } catch (e) {
      setError(e.payload || { errorCode: 'ERROR', message: e.message })
      setState('error')
    }
  }

  return (
    <div className="import-panel backend-import">
      <div className="import-head">
        <span className="badge badge-soft badge-purple">SSC API Test Mode</span>
        <b>Backend를 통한 SecurityScorecard read-only Import</b>
      </div>
      <div className="backend-import-form">
        <Field label="점검 도메인" hint="SecurityScorecard에 등록/조회 가능한 도메인">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="예: acme.com" />
        </Field>
        <PrimaryButton onClick={run} disabled={state === 'loading' || !domain.trim()}>
          {state === 'loading' ? '조회 중…' : 'SSC Risk 가져오기'}
        </PrimaryButton>
      </div>

      {state === 'done' && result && (
        <div className="import-done">
          ✓ SSC API Import 완료 — Score {result.res.summary?.score ?? '—'} / {result.res.summary?.grade ?? '—'} ·
          Risk Finding {result.rows.length}건 생성. Risk Findings 화면에서 확인하세요.
          {result.res.warnings?.length > 0 && (
            <div className="import-warn">일부 데이터(summary/factors) 조회 경고 {result.res.warnings.length}건 — findings는 issues 기준으로 생성됨</div>
          )}
        </div>
      )}
      {state === 'error' && error && (
        <NoticeBox tone="danger" title={`오류: ${error.errorCode || 'ERROR'}`}>{error.message}</NoticeBox>
      )}
      <p className="hint-text">* SSC API read-only 호출입니다. Docker/AI/Playwright/DB는 여전히 mock입니다.</p>
    </div>
  )
}

// ---------------------------------------------------------------------
// Risk Findings — Real SSC API 패널 (read-only collector, risk-findings.v1)
// ---------------------------------------------------------------------
export function RiskFindingsRealPanel({ presetDomain = null, context = null, onFindings = null, app = null, autoLoad = false }) {
  const [domain, setDomain] = useState(presetDomain || 'acme.com')
  const [includeInfo, setIncludeInfo] = useState(false)
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState(null)
  const [typeSummary, setTypeSummary] = useState([]) // 이슈 유형별 요약(영향 점수)
  const [status, setStatus] = useState('idle') // idle|loading|success|empty|scope|error|rate|unreachable|mock
  const [error, setError] = useState(null)
  const [nextOffset, setNextOffset] = useState(0)
  const [typeDrawer, setTypeDrawer] = useState(null) // 이슈 유형 조치 상세
  const mockFindings = ENABLE_DEV_MOCKS ? devData.findings : []

  // 상위(Endpoint 드로어)에서 preset이 바뀌면 대상 도메인 동기화 + (옵션)자동 수집
  useEffect(() => {
    if (!presetDomain) return
    setDomain(presetDomain); setItems([]); setSummary(null); setTypeSummary([]); setStatus('idle'); setTypeDrawer(null)
    if (autoLoad) { load(true, presetDomain) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetDomain])

  const load = async (reset, domainOverride) => {
    const off = reset ? 0 : nextOffset ?? 0
    const target = (domainOverride ?? domain).trim()
    if (!target) return
    setStatus('loading')
    setError(null)
    try {
      const d = await collectRiskFindings(target, { limit: 100, offset: off, includeInfo })
      const merged = reset ? d.findings : [...items, ...d.findings]
      setItems(merged)
      setSummary(d.summary)
      if (Array.isArray(d.issueTypeSummary)) { setTypeSummary(d.issueTypeSummary); primeIssueTypeSummary(target, d.issueTypeSummary) }
      // 수집된 유형의 "해석"을 백그라운드 예열(비블로킹) → 가이드 드로어 즉시 표시
      prewarmInterpretations((d.issueTypeSummary || d.findings || []).map((x) => x.issue_type))
      setNextOffset(d.summary?.nextOffset ?? null)
      setStatus(merged.length ? 'success' : 'empty')
      onFindings?.(merged, context)
      // 도메인 상태 write-back — 의도적 수집(리스크 점검)의 실제 결과를 도메인 레코드에 반영.
      //  · reset(첫 수집)일 때만. 등록 기본값 'SSC Import 대기' → 실측 상태로 갱신.
      if (reset && context?.domainId && app?.updateDomain) {
        const total = typeof d.summary?.total === 'number' ? d.summary.total : merged.length
        const row = (app.domains || []).find((x) => x.id === context.domainId)
        if (row) app.updateDomain({ ...row, status: total > 0 ? '리스크 수집됨' : '수집됨 · Finding 없음', riskCount: total, lastCollectedAt: new Date().toISOString().slice(0, 10) })
      }
    } catch (e) {
      const code = e.payload?.errorCode
      if (code === 'SSC_SCOPE_DENIED') setStatus('scope')
      else if (e.status === 429 || code === 'SSC_RATE_LIMITED') setStatus('rate')
      // Backend/SSC 미연결 시 Mock으로 자동 대체하지 않고 명시적 오류 상태를 표시한다.
      else if (code === 'BACKEND_UNREACHABLE') setStatus('unreachable')
      else { setError(e.payload || { message: e.message }); setStatus('error') }
    }
  }

  // 도메인 종합 증적 팩 — 수집된 모든 유형(정보성 토글 반영)을 한 팩으로 묶음
  const makeBundlePack = () => {
    const baseDomain = context?.sscLookupDomain || domain
    const list = (typeSummary || []).filter((r) => includeInfo || String(r.severity || '').toLowerCase() !== 'info')
    if (!list.length) { app?.showToast?.('묶을 리스크 유형이 없습니다.'); return }
    const issues = [...list].sort((a, b) => (b.score_impact ?? 0) - (a.score_impact ?? 0)).map((t) => ({
      issue_type: t.issue_type,
      factor: t.factor,
      severity: t.severity,
      score_impact: t.score_impact,
      count: t.count,
      ssc_description: t.ssc_description || null,
      sandboxSupported: !!catalogEntry(t.issue_type),
      assets: items.filter((f) => f.issue_type === t.issue_type).map((f) => ({ asset_value: f.asset_value || null, evidence: Array.isArray(f.evidence) ? f.evidence : [], last_seen: f.last_seen || null, own: isOwnAsset(f.asset_value, baseDomain) }))
    }))
    const totalGain = issues.reduce((s, i) => s + (i.score_impact ?? 0), 0)
    const pack = {
      id: `EP-BUNDLE-${Date.now().toString(36).slice(-6).toUpperCase()}`,
      source: 'risk',
      bundle: true,
      title: `${context?.customer || baseDomain} — 도메인 종합 증적 (${issues.length}개 유형)`,
      customer: context?.customer || '—',
      domain: baseDomain,
      riskCount: issues.reduce((s, i) => s + (i.count ?? i.assets.length), 0),
      created: new Date().toISOString().slice(0, 10),
      review: '검수 중',
      publish: '초안',
      customerViewed: '미열람',
      ...newShareFields(),
      score: summary?.score ?? null,
      grade: summary?.grade ?? null,
      totalGain,
      issues
    }
    app?.addEvidencePack?.(pack)
    app?.showToast?.(`도메인 종합 증적 팩 생성됨 — ${issues.length}개 유형`)
    app?.navigate?.('evidence')
  }

  return (
    <div className="real-findings">
      <NoticeBox tone="info">
        <b>Real SSC API · Read-only · factors-first</b> — SecurityScorecard active-issues를 수집한 정규화 결과입니다(읽기 전용).
        자산 URL은 쿼리·자격증명을 제거한 <b>위생 처리</b> 후 표시합니다. API 조회에는 <b>SSC 조회 기준(host)</b>을 사용합니다.
      </NoticeBox>

      {/* 수집 대상 컨텍스트 (고객사/Endpoint 선택 기반) */}
      {context && (
        <div className="kv compact collect-context">
          <div><span>고객사</span><b>{context.customer || '—'}</b></div>
          <div><span>서비스 Endpoint</span><b>{context.serviceEndpoint || '—'}</b></div>
          <div><span>SSC 조회 기준</span><b>{context.sscLookupDomain || domain}</b></div>
          <div><span>수집 방식</span><b>Real SSC API · Read-only</b></div>
        </div>
      )}

      {/* 직접 입력은 개발자 모드에서만 (Developer Direct Domain Input) */}
      {ENABLE_DEV_MOCKS && (
        <div className="rf-controls">
          <span className="dev-tag">Developer Direct Domain Input</span>
          <input className="smoke-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="in-scope 도메인 (예: acme.com)" style={{ maxWidth: 300, marginBottom: 0 }} />
        </div>
      )}

      <div className="rf-controls">
        <PrimaryButton onClick={() => load(true)} disabled={status === 'loading' || !domain.trim() || (!presetDomain && !ENABLE_DEV_MOCKS)}>
          {status === 'loading' ? '수집 중…' : 'SSC 리스크 수집'}
        </PrimaryButton>
        <label className="check-inline"><input type="checkbox" checked={includeInfo} onChange={(e) => { setIncludeInfo(e.target.checked) }} /> 정보성(info) 이슈 포함</label>
        {!presetDomain && !ENABLE_DEV_MOCKS && <span className="hint-text">고객사와 등록 Endpoint를 먼저 선택하세요.</span>}
      </div>

      {/* 상태별 뷰 */}
      {status === 'idle' && (
        <p className="hint-text" style={{ marginTop: 10 }}><b>SSC 리스크 수집</b>을 누르면 이 주소의 SecurityScorecard 리스크를 수집해 점수·조치 우선순위를 표시합니다. (읽기 전용)</p>
      )}
      {status === 'loading' && <div className="rf-skeleton">불러오는 중…</div>}
      {status === 'scope' && (
        <NoticeBox tone="danger" title="Scope Denied">해당 도메인은 현재 SSC 포트폴리오 범위에 없습니다. 포트폴리오 편입 여부를 확인하세요.</NoticeBox>
      )}
      {status === 'rate' && (
        <NoticeBox tone="warning" title="Rate Limited">요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도하세요.</NoticeBox>
      )}
      {status === 'error' && (
        <NoticeBox tone="danger" title={`오류: ${error?.errorCode || 'ERROR'}`}>{error?.message || '수집 중 오류가 발생했습니다.'}</NoticeBox>
      )}
      {status === 'empty' && (
        <EmptyState title="표시할 리스크 없음" desc={includeInfo ? '활성 이슈가 없습니다.' : '비정보성(critical/high/medium/low) 활성 이슈가 없습니다. 정보성 이슈 포함을 켜보세요.'} />
      )}
      {status === 'unreachable' && (
        <>
          <NoticeBox tone="danger" title="Backend 연결 실패 (SSC API 데이터를 불러올 수 없음)">
            프론트엔드는 실행 중이지만 Backend API 서버(포트 8787)에 연결할 수 없습니다. 확인 항목:
            <ul className="bullet" style={{ marginTop: 6 }}>
              <li>Backend가 실행 중인지 확인: <code className="inline-code sm">cd backend &amp;&amp; npm run dev</code></li>
              <li><code className="inline-code sm">SSC_API_TOKEN</code>이 <code className="inline-code sm">backend/.env</code>에 설정되어 있는지 확인</li>
              <li>입력한 도메인이 Portfolio/Followed Company 범위에 포함되어 있는지 확인</li>
              <li>잠시 후 다시 시도</li>
            </ul>
          </NoticeBox>
          <div className="btn-row">
            <SecondaryButton onClick={() => load(true)}>다시 시도</SecondaryButton>
            {ENABLE_DEV_MOCKS && (
              <SecondaryButton onClick={() => setStatus('mock')}>Developer: Mock 데이터로 보기</SecondaryButton>
            )}
          </div>
        </>
      )}
      {ENABLE_DEV_MOCKS && status === 'mock' && (
        <>
          <NoticeBox tone="warning" title="Developer Mock Samples">
            UI 개발·회귀 테스트용 예시 데이터입니다. 실제 SSC API 결과가 아닙니다
            (<code className="inline-code sm">VITE_ENABLE_DEV_MOCKS=true</code>). 수동 선택 시에만 표시됩니다.
          </NoticeBox>
          <MockFindingsTable rows={mockFindings} />
        </>
      )}
      {status === 'success' && summary && (
        <>
          <div className="rf-summary">
            <span>Score <b>{summary.score ?? '—'}/{summary.grade ?? '—'}</b></span>
            <span>활성 issue type <b>{summary.activeIssueTypeCount}</b></span>
            <span>정규화 finding <b>{summary.totalNormalizedFindingCount}</b></span>
            <span>표시 <b>{items.length}</b>{summary.hasMore ? '+' : ''}</span>
          </div>
          <IssueTypeSummary rows={typeSummary} includeInfo={includeInfo} score={summary.score} grade={summary.grade} onSelectType={setTypeDrawer} />
          <p className="hint-text" style={{ marginTop: 8 }}>유형 행을 클릭하면 조치 방법과 <b>관측된 자산</b>이 열립니다. 검증랩 지원 항목은 <b>검증랩 PoC</b>, 미지원 항목은 <b>조치 가이드</b>로 이어집니다.</p>
        </>
      )}

      {typeDrawer && (
        <TypeRemediationDrawer
          item={typeDrawer}
          findings={items.filter((f) => f.issue_type === typeDrawer.issue_type)}
          context={context}
          app={app}
          onClose={() => setTypeDrawer(null)}
        />
      )}
    </div>
  )
}

// 조치 우선순위표 — 유형 단위 "점수 개선 여력(+)" 기회 프레임. 행 클릭 → 조치 상세.
// (재조정된 영향/침해위험은 SSC read API 미제공이라 제외)
export function IssueTypeSummary({ rows, includeInfo, score, grade, onSelectType, lastCol }) {
  const list = (rows || []).filter((r) => includeInfo || String(r.severity || '').toLowerCase() !== 'info')
  if (!list.length) return null
  const sorted = [...list].sort((a, b) => (b.score_impact ?? 0) - (a.score_impact ?? 0))
  const maxGain = Math.max(...sorted.map((r) => r.score_impact ?? 0), 0.0001)
  const totalGain = sorted.reduce((s, r) => s + (r.score_impact ?? 0), 0)
  const potential = score != null ? Math.min(100, Math.round(score + totalGain)) : null
  return (
    <div className="its-wrap card no-pad">
      <div className="prio-metric">
        <div className="prio-now">
          <div className="prio-cap">현재 점수</div>
          <div className="prio-score">{score ?? '—'} <span>/ {grade ?? '—'}</span></div>
        </div>
        <i className="prio-arrow">→</i>
        <div className="prio-gain">
          <div className="prio-cap">모두 조치 시 최대</div>
          <div className="prio-up">+{totalGain.toFixed(1)}점 {potential != null && <span>(약 {potential})</span>}</div>
        </div>
        <div className="prio-note hint-text">SSC 점수 영향값 기준 예상치 · 재스캔 시 실제 회복량은 달라질 수 있음</div>
      </div>
      <div className="its-head">
        <span className="its-title">조치 우선순위</span>
        <span className="hint-text">점수 개선 여력 순 · 유형 {sorted.length}종 · 행 클릭 시 조치 방법</span>
      </div>
      <table className="data-table its-table">
        <thead>
          <tr>
            <th className="its-rank">#</th>
            <th>문제 (이슈 유형)</th>
            <th>위협 수준</th>
            <th className="its-num">점수 개선 여력</th>
            <th className="its-num">조사 결과</th>
            <th>{lastCol?.header || '검증랩'}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const gain = Number(r.score_impact ?? 0)
            const w = Math.max(4, Math.round((gain / maxGain) * 100))
            const supported = !!catalogEntry(r.issue_type)
            return (
              <tr key={r.issue_type} className="clickable" onClick={() => onSelectType?.(r)}>
                <td data-label="#" className="its-rank">{i + 1}</td>
                <td data-label="문제">
                  <strong>{catalogNameKo(r.issue_type)}</strong>
                  <div className="hint-text">{factorNameKo(r.factor)} · {r.issue_type}</div>
                </td>
                <td data-label="위협 수준"><SeverityBadge level={r.severity} /></td>
                <td data-label="점수 개선 여력" className="its-num">
                  <span className="its-impact">
                    <span className="its-bar"><span className="its-bar-fill gain" style={{ width: `${w}%` }} /></span>
                    <b className="gain-num">+{gain.toFixed(1)}</b>
                  </span>
                </td>
                <td data-label="조사 결과" className="its-num">{r.count ?? 0}건</td>
                <td data-label={lastCol?.header || '검증랩'}>
                  {lastCol
                    ? lastCol.render(r)
                    : (supported
                        ? <span className="badge badge-soft badge-success">지원</span>
                        : <span className="badge badge-soft badge-neutral">미지원</span>)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// URL → 호스트. 등록 도메인(base) 트리(자신/서브도메인) 안이면 자사 자산으로 간주.
function hostOf(u) { try { return new URL(u).host.toLowerCase() } catch { return String(u || '').toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0] } }
function isOwnAsset(assetUrl, baseDomain) {
  const b = String(baseDomain || '').toLowerCase().replace(/^www\./, '')
  if (!b || !assetUrl) return true // 기준 없으면 표기 생략
  const h = hostOf(assetUrl)
  return h === b || h.endsWith('.' + b)
}

// SSC 공식 조치 방법(영문) → 쉬운 한국어 해석 (로컬 Ollama, 캐시 우선). 실패/원문없음 시 생략.
function SscRecInterpretation({ issueType, sscRec, name }) {
  const [state, setState] = useState(() => {
    if (!sscRec) return { status: 'skip', text: '' }
    const c = cachedRemediation(issueType)
    return c ? { status: 'ok', text: c } : { status: 'loading', text: '' }
  })
  useEffect(() => {
    if (!sscRec) { setState({ status: 'skip', text: '' }); return }
    const c = cachedRemediation(issueType)
    if (c) { setState({ status: 'ok', text: c }); return }
    let alive = true
    setState({ status: 'loading', text: '' })
    loadRemediationInterpretation(issueType, sscRec, name).then((t) => {
      if (alive) setState(t ? { status: 'ok', text: t } : { status: 'skip', text: '' })
    })
    return () => { alive = false }
  }, [issueType, sscRec, name])
  if (state.status === 'skip') return null
  return (
    <>
      <div className="mini-title">해석 <span className="hint-text">쉬운 말 요약 · AI 생성</span></div>
      {state.status === 'loading'
        ? <div className="interp-skeleton" aria-label="해석 생성 중"><span /><span /><span /></div>
        : <p className="guide-text interp-text">{state.text}</p>}
    </>
  )
}

// 이슈 유형 조치 상세 드로어 — 점수 개선 여력 + SSC 공식 조치 방법 + 한글 요약 + 관측된 자산 + 검증랩 이동
function TypeRemediationDrawer({ item, findings = [], context, app, onClose }) {
  const baseDomain = context?.sscLookupDomain || null
  const entry = catalogEntry(item.issue_type)
  const supported = !!entry
  const gain = Number(item.score_impact ?? 0)
  const koRec = remediationKo(item.issue_type) || factorRemediationKo(item.factor)
  const totalCount = item.count ?? findings.length
  const shown = findings.length
  const partial = shown < totalCount
  // 리스크 → 증적 팩(고객 전달본) 조립: 문제(자산·증거) + 검증(지원 여부) + 조치 가이드
  const makePack = () => {
    const slug = String(item.issue_type || 'risk').replace(/[^a-z0-9]/gi, '').slice(0, 14)
    const pack = {
      id: `EP-RISK-${slug}-${Date.now().toString(36).slice(-5).toUpperCase()}`,
      source: 'risk',
      issueType: item.issue_type,
      title: `${catalogNameKo(item.issue_type)} — 고객 전달 증적`,
      customer: context?.customer || '—',
      industry: app?.customers?.find((c) => c.name === context?.customer)?.industry || null,
      domain: context?.sscLookupDomain || '—',
      riskCount: findings.length,
      created: new Date().toISOString().slice(0, 10),
      review: '검수 중',
      publish: '초안',
      customerViewed: '미열람',
      ...newShareFields(),
      category: factorNameKo(item.factor),
      sandboxSupported: supported,
      risk: { issue_type: item.issue_type, factor: item.factor, severity: item.severity, score_impact: item.score_impact, count: item.count },
      ssc_description: item.ssc_description || null,
      ssc_recommendation: item.ssc_recommendation || null,
      assets: (findings || []).map((f) => ({ asset_value: f.asset_value || null, evidence: Array.isArray(f.evidence) ? f.evidence : [], last_seen: f.last_seen || null, own: isOwnAsset(f.asset_value, baseDomain) }))
    }
    app?.addEvidencePack?.(pack)
    app?.showToast?.('증적 팩 생성됨 — 증적 팩 화면에서 확인하세요')
    onClose?.()
    app?.navigate?.('evidence')
  }
  // 검증랩 지원 → 검증랩 PoC / 미지원 → 조치 가이드. 상태별 단일 액션 + 닫기.
  const footer = (
    <>
      {supported
        ? <PrimaryButton onClick={() => { app?.navigate?.('sandbox', { serviceEndpoint: context?.serviceEndpoint, sscLookupDomain: context?.sscLookupDomain, issueType: item.issue_type }); onClose?.() }}>검증랩 PoC</PrimaryButton>
        : <PrimaryButton onClick={() => { app?.navigate?.('guides', item.issue_type); onClose?.() }}>조치 가이드</PrimaryButton>}
      <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
    </>
  )
  return (
    <Drawer
      title={catalogNameKo(item.issue_type)}
      subtitle={`${factorNameKo(item.factor)} · ${item.issue_type}`}
      badges={<>
        <SeverityBadge level={item.severity} />
        <span className="badge badge-soft badge-success">점수 개선 여력 +{gain.toFixed(1)}</span>
        <span className={`badge badge-soft ${supported ? 'badge-success' : 'badge-neutral'}`}>검증랩 {supported ? '지원' : '미지원'}</span>
      </>}
      onClose={onClose}
      footer={footer}
      width="md"
    >
      <div className="kv">
        <div><span>리스크 영역(10대)</span><b>{factorNameKo(item.factor)}</b></div>
        <div><span>조사 결과</span><b>{item.count ?? 0}건</b></div>
        <div><span>점수 개선 여력</span><b className="gain-num">+{gain.toFixed(1)}점</b></div>
      </div>

      {item.ssc_description && (
        <>
          <div className="mini-title">무엇이 문제인가</div>
          <p className="guide-text">{item.ssc_description}</p>
        </>
      )}

      <div className="mini-title">조치 방법 (요약)</div>
      <p className="guide-text">{koRec || '아래 SSC 공식 조치 방법을 참고하세요.'}</p>

      {item.ssc_recommendation && (
        <>
          <div className="mini-title">SSC 공식 조치 방법</div>
          <p className="guide-text ssc-rec">{item.ssc_recommendation}</p>
          <SscRecInterpretation issueType={item.issue_type} sscRec={item.ssc_recommendation} name={catalogNameKo(item.issue_type)} />
        </>
      )}

      <ComplianceRef issueType={item.issue_type} category={entry?.category} />

      <div className="mini-title">관측된 자산 <span className="hint-text">({totalCount}건{partial ? ` 중 ${shown}건 표시` : ''})</span></div>
      <p className="hint-text" style={{ marginTop: 0 }}>같은 조치가 적용/검증되어야 할 범위입니다. (조치 방법은 위 유형 단위로 동일)</p>
      {shown > 0 ? (
        <div className="card no-pad">
          <table className="data-table asset-table">
            <thead>
              <tr>
                <th>대상 (실제 URL)</th>
                <th>관측 증거</th>
                <th className="its-num">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f, i) => (
                <tr key={i}>
                  <td data-label="대상">
                    {f.asset_value ? <code className="inline-code sm">{f.asset_value}</code> : <span className="muted-cell">—</span>}
                    {f.asset_value && !isOwnAsset(f.asset_value, baseDomain) && <span className="badge badge-soft badge-warning asset-flag">타 도메인 · 소유 확인</span>}
                  </td>
                  <td data-label="관측 증거">
                    {Array.isArray(f.evidence) && f.evidence.length
                      ? <ul className="evidence-list">{f.evidence.map((e, j) => <li key={j}><code className="inline-code xs">{e}</code></li>)}</ul>
                      : <span className="muted-cell">—</span>}
                  </td>
                  <td data-label="Last Seen" className="its-num">{f.last_seen || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint-text">표시할 자산 정보가 없습니다. (정보성 이슈 포함을 켜보세요)</p>
      )}
      <p className="hint-text"><span className="badge badge-soft badge-warning asset-flag">타 도메인 · 소유 확인</span> 표시는 등록 도메인{baseDomain ? ` (${baseDomain})` : ''} 밖의 SSC 귀속 자산으로, 관련 자산일 수 있으나 실제 소유 여부 확인이 필요합니다. <b>고객사 소유가 아닌 경우 SecurityScorecard(SSC)에 자산 귀속 정정(제외) 요청이 필요합니다.</b></p>

      <NoticeBox tone="info">
        점수 개선 여력(+{gain.toFixed(1)})은 SSC 점수 영향값 기준 <b>예상치</b>입니다. 조치 후 SSC 재스캔 시 실제 회복량은 달라질 수 있습니다.
      </NoticeBox>
    </Drawer>
  )
}

function MockFindingsTable({ rows }) {
  const columns = [
    { key: 'risk', label: '리스크 항목' },
    { key: 'source', label: '수집 출처' },
    { key: 'customer', label: '고객사' },
    { key: 'severity', label: '위험도' },
    { key: 'state', label: '워크플로우 상태' }
  ]
  const renderCell = (key, row) => {
    if (key === 'source') return <SourceBadge source={row.source} />
    if (key === 'severity') return <SeverityBadge level={row.severity} />
    if (key === 'state') return <StatusBadge status={row.state} />
    if (key === 'risk') return <strong>{row.risk}</strong>
    return row[key]
  }
  return <div className="card no-pad"><DataTable columns={columns} rows={rows} renderCell={renderCell} /></div>
}

// ---------------------------------------------------------------------
// SSC API Smoke Test (Partner Admin 내부용)
// ---------------------------------------------------------------------
function RawBlock({ label, data }) {
  const [open, setOpen] = useState(false)
  if (data === undefined) return null
  return (
    <div className="raw-block">
      <button className="raw-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▼' : '▶'} {label} (raw)
      </button>
      {open && <pre className="raw-pre">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  )
}

export function SscSmokeTest() {
  const [domain, setDomain] = useState('')
  const [health, setHealth] = useState(null)
  const [busy, setBusy] = useState('')
  const [out, setOut] = useState(null) // { kind, normalized, raw }
  const [error, setError] = useState(null)

  useEffect(() => {
    sscHealth().then(setHealth).catch((e) => setError(e.payload || { message: e.message }))
  }, [])

  const runCheck = async (kind, fn, needsDomain = true) => {
    if (needsDomain && !domain.trim()) {
      setError({ errorCode: 'NO_DOMAIN', message: '도메인을 입력하세요.' })
      return
    }
    setBusy(kind)
    setError(null)
    setOut(null)
    try {
      const res = await fn()
      setOut({ kind, res })
    } catch (e) {
      setError(e.payload || { errorCode: 'ERROR', message: e.message })
    } finally {
      setBusy('')
    }
  }

  const d = domain.trim()
  return (
    <div className="card smoke-test">
      <div className="smoke-head">
        <div>
          <div className="section-kicker">PARTNER ADMIN · 내부용</div>
          <h2>SSC API Smoke Test</h2>
        </div>
        <div className="badge-row" style={{ marginBottom: 0 }}>
          {health ? (
            <>
              <span className={`badge badge-soft ${health.tokenConfigured ? 'badge-success' : 'badge-warning'}`}>
                Token {health.tokenConfigured ? 'Configured' : 'Not Configured'}
              </span>
              <span className="badge badge-soft badge-neutral">{health.baseUrl}</span>
            </>
          ) : (
            <span className="badge badge-soft badge-neutral">Backend 상태 확인 중…</span>
          )}
        </div>
      </div>

      <NoticeBox tone="info">
        이 패널은 <b>Backend를 통해 SecurityScorecard API를 read-only로 호출</b>합니다. API Token은 표시되지 않으며,
        브라우저는 우리 Backend만 호출합니다. (Backend 미실행 시 연결 오류가 표시됩니다.)
      </NoticeBox>

      <div className="smoke-form">
        <input
          className="smoke-domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="점검 도메인 입력 (예: acme.com)"
        />
        <div className="smoke-btns">
          <SecondaryButton onClick={() => sscHealth().then(setHealth).catch((e) => setError(e.payload || { message: e.message }))}>
            Health Check
          </SecondaryButton>
          <SecondaryButton onClick={() => runCheck('summary', () => sscSummary(d))} disabled={busy === 'summary'}>Summary 조회</SecondaryButton>
          <SecondaryButton onClick={() => runCheck('factors', () => sscFactors(d))} disabled={busy === 'factors'}>Factors 조회</SecondaryButton>
          <SecondaryButton onClick={() => runCheck('issues', () => sscIssues(d))} disabled={busy === 'issues'}>Issues 조회</SecondaryButton>
          <SecondaryButton onClick={() => runCheck('issue-types', () => sscIssueTypes(), false)} disabled={busy === 'issue-types'}>Issue Types</SecondaryButton>
          <PrimaryButton onClick={() => runCheck('import', () => sscImportRisk({ domain: d }))} disabled={busy === 'import'}>Import Risk</PrimaryButton>
        </div>
      </div>

      {error && (
        <NoticeBox tone="danger" title={`오류: ${error.errorCode || 'ERROR'}`}>{error.message}</NoticeBox>
      )}

      {out && (
        <div className="smoke-out">
          <div className="mini-title">결과: {out.kind} <span className="badge badge-soft badge-success">OK</span></div>
          <NormalizedPreview kind={out.kind} res={out.res} />
          <RawBlock label={out.kind} data={out.res.raw ?? out.res} />
        </div>
      )}
    </div>
  )
}

function NormalizedPreview({ kind, res }) {
  if (kind === 'summary')
    return <pre className="norm-pre">{JSON.stringify(res.summary, null, 2)}</pre>
  if (kind === 'factors')
    return <pre className="norm-pre">{JSON.stringify(res.factors, null, 2)}</pre>
  if (kind === 'issues')
    return <pre className="norm-pre">{JSON.stringify(res.issues?.slice(0, 20), null, 2)}</pre>
  if (kind === 'issue-types')
    return <pre className="norm-pre">{JSON.stringify(res.issueTypes?.slice(0, 20), null, 2)}</pre>
  if (kind === 'import')
    return (
      <pre className="norm-pre">{JSON.stringify({ summary: res.summary, findingsCount: res.findings?.length, findings: res.findings?.slice(0, 10), warnings: res.warnings }, null, 2)}</pre>
    )
  return null
}
