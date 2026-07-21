// =====================================================================
// Validation Sandbox — 표준 검증랩 PoC 실행 패널 (beta)
//  - issue_type 선택 → 백엔드 오케스트레이터 실행 → Before/After 참고 증적 표시.
//  - 참고용 PoC. 고객환경 검증/조치완료 아님. 실제 해소는 SSC 재스캔.
// =====================================================================
import React, { useEffect, useState } from 'react'
import { listLabRuns, runLabPoC, deleteLabRuns } from '../lib/labApi.js'
import { collectRiskFindings } from '../lib/sscApi.js'
import { catalogGroups, catalogEntry, catalogNameKo, canonicalIssueKey, KO_SEVERITY, KO_COLLECTOR, KO_EVIDENCE_MODE } from '../data/sandboxCatalog.js'
import { EngineRemediation } from '../components/EngineRemediation.jsx'
import { ComplianceRef } from '../components/ComplianceRef.jsx'
import { guideRowMeta } from '../data/remediationSteps.js' // 유형 메타(난이도·영향) 단일 소스
import { Icon } from '../components/icons.jsx'
import { parseEndpoint } from '../lib/domainScope.js'
import { ENABLE_DEV_MOCKS } from '../config/runtime.js'
import {
  PrimaryButton,
  SecondaryButton,
  BulkActionsBar,
  NoticeBox,
  EndpointContext,
  StatusBadge,
  MockScreenshot,
  BeforeAfterDiff,
  EvidenceCard,
  Drawer,
  CustomerEndpointSelect,
  CodeBlock,
  EmptyState
} from '../components/common.jsx'

// 팩 id 는 (고객사 + 이슈)별로 안정적 — 같은 이슈를 여러 번 재현/지정해도 하나의 팩을 업서트한다.
//  → labRunId 만 바뀌며 '대표 증적'이 재지정된다(팩이 중복 생성되지 않음).
export const labPackId = (run) =>
  'EP-LAB-' + canonicalIssueKey(run.issueType) + '-' + String(run.customer || 'none').trim().replace(/\s+/g, '_')

export function packFromRun(run) {
  const now = new Date().toISOString().slice(0, 10)
  return {
    id: labPackId(run),
    title: `${catalogNameKo(run.issueType)} — 파트너 검증랩 참고 증적`,
    customer: run.customer || '—',
    domain: run.sscLookupDomain || run.domain || '—',
    serviceEndpoint: run.serviceEndpoint || null,
    accessUrl: run.accessUrl || null,
    sscLookupDomain: run.sscLookupDomain || run.domain || null,
    riskCount: 1,
    created: now,
    review: 'In Review',
    publish: 'Draft',
    customerViewed: '미열람',
    source: 'lab',
    labRunId: run.id,
    issueType: run.issueType,
    category: run.category
  }
}

// 증적 상태 라벨 (한글)
function evidenceStateLabel(run) {
  if (run.status === 'unsupported') return '가이드만 제공'
  if (run.status !== 'succeeded') return '실패'
  const map = { 'Draft Evidence': '초안 증적', 'Evidence Candidate': '증적 후보', 'Added to Evidence Pack Draft': '증적 팩(초안) 포함' }
  return map[run.evidenceState] || '초안 증적'
}
// 실행 상태 라벨 (한글)
function runStateLabel(run) {
  return run.status === 'succeeded' ? '성공' : run.status === 'unsupported' ? '미지원' : '실패'
}

export function ValidationSandboxRealPanel({ app, fixedEndpoint = null, focusIssueType = null }) {
  const [endpoint, setEndpoint] = useState(fixedEndpoint)
  const [findings, setFindings] = useState([])
  const [findStatus, setFindStatus] = useState('idle') // idle|loading|success|empty|scope|error|unreachable
  const [findingKey, setFindingKey] = useState('') // 선택된 issue_type
  const [runStatus, setRunStatus] = useState('idle') // idle|loading|error|unreachable
  const [runError, setRunError] = useState(null)
  const [runs, setRuns] = useState([])
  const [drawerRun, setDrawerRun] = useState(null)
  const [selectedRuns, setSelectedRuns] = useState(() => new Set()) // 재현 기록 정리(선택 삭제)
  const [deletingRuns, setDeletingRuns] = useState(false)
  const [runsPage, setRunsPage] = useState(0) // 재현 기록 페이지네이션
  const isAdmin = app?.user?.role === 'admin'

  // 개발자 직접 실행(Developer Direct Run)
  const devGroups = catalogGroups()
  const [devIssue, setDevIssue] = useState(devGroups[0]?.items?.[0]?.key || 'hsts_incorrect')
  const [devEndpoint, setDevEndpoint] = useState('gateway.example.com:8443')

  const refreshRuns = () => listLabRuns().then(setRuns).catch(() => {})
  useEffect(() => { refreshRuns() }, []) // eslint-disable-line

  // 고객사/Endpoint 변경 시 Finding 초기화
  useEffect(() => { setFindings([]); setFindStatus('idle'); setFindingKey('') }, [endpoint?.domainId])

  // fixedEndpoint(드로어)면 endpoint 동기화 + Risk Finding 자동 로드
  useEffect(() => {
    if (!fixedEndpoint) return
    setEndpoint(fixedEndpoint)
    loadFindingsFor(fixedEndpoint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedEndpoint?.domainId])

  const loadFindingsFor = async (ep) => {
    if (!ep?.sscLookupDomain) return
    setFindStatus('loading')
    try {
      const d = await collectRiskFindings(ep.sscLookupDomain, { limit: 20, offset: 0, includeInfo: false })
      const list = d.findings || []
      setFindings(list)
      const pick = focusIssueType ? list.find((x) => x.issue_type === focusIssueType) : null
      setFindingKey((pick || list[0])?.issue_type || '')
      setFindStatus(list.length ? 'success' : 'empty')
    } catch (e) {
      const code = e.payload?.errorCode
      if (code === 'SSC_SCOPE_DENIED') setFindStatus('scope')
      else if (code === 'BACKEND_UNREACHABLE') setFindStatus('unreachable')
      else setFindStatus('error')
    }
  }

  const loadFindings = async () => {
    if (!endpoint?.sscLookupDomain) return
    setFindStatus('loading')
    try {
      const d = await collectRiskFindings(endpoint.sscLookupDomain, { limit: 20, offset: 0, includeInfo: false })
      const list = d.findings || []
      setFindings(list)
      const pick = focusIssueType ? list.find((x) => x.issue_type === focusIssueType) : null
      setFindingKey((pick || list[0])?.issue_type || '')
      setFindStatus(list.length ? 'success' : 'empty')
    } catch (e) {
      const code = e.payload?.errorCode
      if (code === 'SSC_SCOPE_DENIED') setFindStatus('scope')
      else if (code === 'BACKEND_UNREACHABLE') setFindStatus('unreachable')
      else setFindStatus('error')
    }
  }

  const selectedFinding = findings.find((f) => f.issue_type === findingKey) || null
  const entry = catalogEntry(findingKey)
  const supported = !!entry

  const execute = async () => {
    if (!endpoint || !findingKey) return
    setRunStatus('loading'); setRunError(null)
    try {
      const run = await runLabPoC({
        issueType: findingKey,
        customer: endpoint.customer || null,   // 증적 팩이 고객사에 귀속되도록(없으면 팩이 '—'로 저장되어 드로어에서 누락)
        domain: endpoint.sscLookupDomain || null,
        serviceEndpoint: endpoint.serviceEndpoint || null,
        accessUrl: endpoint.accessUrl || null,
        sscLookupDomain: endpoint.sscLookupDomain || null
      })
      setRunStatus('idle')
      // 최신 기본: 이 이슈의 대표 증적 팩이 이미 있으면 방금 만든 최신 런으로 자동 재지정.
      //  (팩이 없으면 자동 생성하지 않음 — 담기는 사용자가 명시적으로)
      if (run?.id) {
        const pid = labPackId({ issueType: findingKey, customer: endpoint.customer })
        if ((app?.evidencePacks || []).some((p) => p.id === pid)) {
          app?.updateEvidencePack?.(pid, { labRunId: run.id })
          app?.showToast?.({ tone: 'success', text: '재현 완료 — 대표 증적을 최신으로 갱신했습니다.' })
        } else {
          app?.showToast?.('재현 완료 — 최근 실행 목록에서 증적을 확인하고 대표로 지정하세요.')
        }
      }
      refreshRuns()
    } catch (e) {
      setRunError(e.payload || { message: e.message })
      setRunStatus(e.code === 'BACKEND_UNREACHABLE' ? 'unreachable' : 'error')
    }
  }

  const execDev = async () => {
    const ep = parseEndpoint(devEndpoint)
    setRunStatus('loading'); setRunError(null)
    try {
      await runLabPoC({ issueType: devIssue, domain: ep.sscLookupDomain, serviceEndpoint: ep.serviceEndpoint, accessUrl: ep.accessUrl, sscLookupDomain: ep.sscLookupDomain })
      setRunStatus('idle'); refreshRuns()
    } catch (e) {
      setRunError(e.payload || { message: e.message })
      setRunStatus(e.code === 'BACKEND_UNREACHABLE' ? 'unreachable' : 'error')
    }
  }

  return (
    <div className="card lab-panel">
      <div className="smoke-head">
        <div>
          <div className="section-kicker">파트너 검증랩 · 참고용 시연</div>
          <h2>표준 검증랩에서 조치 전후 재현</h2>
        </div>
        <span className="badge badge-soft badge-purple">참고용 · 고객환경 검증 아님</span>
      </div>
      <p className="hint-text" style={{ margin: '2px 0 8px' }}>
        고객 시스템을 건드리지 않고, 파트너 검증랩에서 <b>같은 문제를 재현</b>해 <b>조치 전 → 조치 후</b>를 비교로 보여주는 참고 자료입니다.
      </p>

      {/* 1) 고객사 → Endpoint 선택 (드로어에서는 고정 Endpoint 컨텍스트) */}
      {fixedEndpoint ? (
        <EndpointContext customer={endpoint?.customer} serviceEndpoint={endpoint?.serviceEndpoint} sscLookupDomain={endpoint?.sscLookupDomain} accessUrl={endpoint?.accessUrl} />
      ) : (
        <CustomerEndpointSelect customers={app.customers} domains={app.domains} onSelect={setEndpoint} />
      )}

      {/* 2) 리스크 항목 불러오기 / 선택 */}
      <div className="lab-controls" style={{ marginTop: 12 }}>
        <SecondaryButton onClick={loadFindings} disabled={!endpoint?.sscLookupDomain || findStatus === 'loading'}>
          {findStatus === 'loading' ? '리스크 항목 불러오는 중…' : '이 대상의 리스크 항목 불러오기'}
        </SecondaryButton>
        {findStatus === 'success' && (
          <label className="field" style={{ minWidth: 380 }}>
            <span className="field-label">재현할 리스크 항목 선택</span>
            <select value={findingKey} onChange={(e) => setFindingKey(e.target.value)}>
              {/* canonical(별칭·버전) 기준 중복 제거 — csp_no_policy/_v2 등이 한 번만 표시 */}
              {Object.values(findings.reduce((acc, f) => { const k = canonicalIssueKey(f.issue_type); if (!acc[k]) acc[k] = f; return acc }, {})).map((f, i) => (
                <option key={`${f.issue_type}-${i}`} value={f.issue_type}>
                  {catalogNameKo(f.issue_type)} · 위험도 {KO_SEVERITY[String(f.severity).toLowerCase()] || f.severity}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {findStatus === 'scope' && <NoticeBox tone="danger" title="조회 범위 밖">이 도메인은 현재 SecurityScorecard 조회 범위(포트폴리오)에 없습니다.</NoticeBox>}
      {findStatus === 'empty' && <NoticeBox tone="info" title="리스크 항목 없음">이 대상에서 확인된 활성 리스크 항목이 없습니다.</NoticeBox>}
      {findStatus === 'unreachable' && (
        <NoticeBox tone="danger" title="서버 연결 실패">백엔드 서버(8787)에 연결할 수 없습니다. <code className="inline-code sm">cd backend &amp;&amp; npm run dev</code> 실행 후 다시 시도하세요.</NoticeBox>
      )}
      {findStatus === 'error' && <NoticeBox tone="danger" title="오류">리스크 항목을 불러오는 중 오류가 발생했습니다.</NoticeBox>}

      {/* 3) Sandbox 지원 상태 + 실행 */}
      {findStatus === 'success' && selectedFinding && (
        <>
          <div className={`sandbox-support ${supported ? 'ok' : 'no'}`}>
            {supported ? (
              <>
                <div className="mini-title">검증랩에서 재현 가능한 항목입니다</div>
                <div className="issue-meta-chips">
                  <span className="chip">분류: {entry.category}</span>
                  <span className="chip">확인 방식: {KO_COLLECTOR[entry.collector_type] || entry.collector_type}</span>
                  <span className="chip">증적 형태: {KO_EVIDENCE_MODE[entry.evidence_mode] || entry.evidence_mode}</span>
                  <span className={`chip sev-${entry.severity}`}>위험도: {KO_SEVERITY[entry.severity] || entry.severity}</span>
                </div>
              </>
            ) : (
              <NoticeBox tone="warning" title="검증랩 미지원 항목">
                이 항목은 아직 검증랩에서 재현할 템플릿이 없습니다. 일반 조치 가이드만 제공됩니다.
              </NoticeBox>
            )}
          </div>
          <div className="lab-controls">
            {!supported ? (
              // 미지원 항목: 죽은 재현 버튼 대신 조치 가이드로 라우팅(지원→랩 / 미지원→가이드 모델 일관).
              <SecondaryButton onClick={() => { app?.navigate?.('guides', findingKey) }}>조치 가이드로 이동</SecondaryButton>
            ) : app?.can?.('labs') ? (
              <PrimaryButton onClick={execute} disabled={runStatus === 'loading'}>
                {runStatus === 'loading' ? '재현 중…' : '검증랩에서 조치 전후 재현'}
              </PrimaryButton>
            ) : (
              <span className="hint-text">읽기 전용 — 검증랩 실행 권한이 없습니다.</span>
            )}
          </div>
        </>
      )}

      {runStatus === 'unreachable' && <NoticeBox tone="danger" title="서버 연결 실패">백엔드 서버(8787)에 연결할 수 없습니다. <code className="inline-code sm">cd backend &amp;&amp; npm run dev</code></NoticeBox>}
      {runStatus === 'error' && runError && <NoticeBox tone="danger" title="오류">{runError.message}</NoticeBox>}

      {/* Developer Direct Run — dev only */}
      {ENABLE_DEV_MOCKS && app?.can?.('labs') && (
        <div className="dev-direct">
          <div className="mini-title">Developer Direct Run</div>
          <NoticeBox tone="warning">개발/테스트용 직접 실행입니다(issue_type·endpoint 직접 지정). 일반 운영 흐름이 아닙니다.</NoticeBox>
          <div className="lab-controls">
            <label className="field" style={{ minWidth: 320 }}>
              <span className="field-label">Issue Type</span>
              <select value={devIssue} onChange={(e) => setDevIssue(e.target.value)}>
                {devGroups.map((g) => (
                  <optgroup key={g.category} label={g.category}>
                    {g.items.map((it) => <option key={it.key} value={it.key}>{it.display_name} ({it.key})</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field" style={{ minWidth: 240 }}>
              <span className="field-label">대상 Endpoint (host[:port])</span>
              <input value={devEndpoint} onChange={(e) => setDevEndpoint(e.target.value)} placeholder="gateway.example.com:8443" />
            </label>
            <SecondaryButton onClick={execDev} disabled={runStatus === 'loading'}>Developer Direct Run</SecondaryButton>
          </div>
        </div>
      )}

      {/* 4) 최근 실행 결과 목록 (상세는 드로어) — 드로어에서는 이 Endpoint로 한정 */}
      <div className="mini-title" style={{ marginTop: 18 }}>{fixedEndpoint ? '이 대상의 최근 재현 기록' : '최근 재현 기록'}</div>
      {(() => {
        const shownRuns = fixedEndpoint
          ? runs.filter((r) => (r.serviceEndpoint || r.sscLookupDomain || r.domain) === (endpoint?.serviceEndpoint || endpoint?.sscLookupDomain))
          : runs
        const PAGE = 10
        const totalPages = Math.max(1, Math.ceil(shownRuns.length / PAGE))
        const page = Math.min(runsPage, totalPages - 1)
        const visible = shownRuns.slice(page * PAGE, page * PAGE + PAGE)
        // 현재 대표 증적으로 지정된 런 id 집합(팩의 labRunId). 이 런이 팩·리포트에 실제 사용된다.
        const repRunIds = new Set((app?.evidencePacks || []).filter((p) => p.source === 'lab').map((p) => p.labRunId))
        // 특정 런을 대표 증적으로 지정 — 이 이슈의 팩이 있으면 재지정(상태 보존), 없으면 생성.
        const designate = (r) => {
          if (r.status !== 'succeeded') { app?.showToast?.({ tone: 'warning', text: '성공한 재현만 대표로 지정할 수 있습니다.' }); return }
          const pid = labPackId(r)
          const existing = (app?.evidencePacks || []).find((p) => p.id === pid)
          if (existing) app?.updateEvidencePack?.(pid, { labRunId: r.id, issueType: r.issueType, customer: r.customer })
          else app?.addEvidencePack?.(packFromRun(r))
          app?.showToast?.({ tone: 'success', text: '대표 증적으로 지정됨 — 팩·전달 리포트에 이 증적이 사용됩니다.' })
        }
        const toggle = (id) => setSelectedRuns((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
        const allChecked = visible.length > 0 && visible.every((r) => selectedRuns.has(r.id))
        const toggleAll = () => setSelectedRuns(() => (allChecked ? new Set() : new Set(visible.map((r) => r.id))))
        const doDelete = async () => {
          const ids = [...selectedRuns]
          if (!ids.length) return
          if (!window.confirm(`선택한 ${ids.length}건의 재현 기록을 삭제할까요?\n(참고용 PoC 데이터 — 필요 시 다시 실행 가능)`)) return
          setDeletingRuns(true)
          try { await deleteLabRuns(ids); setSelectedRuns(new Set()); await refreshRuns(); app?.showToast?.({ tone: 'success', text: `${ids.length}건 삭제됨` }) }
          catch (e) { app?.showToast?.({ tone: 'danger', text: e?.payload?.message || '삭제 실패(관리자 권한 필요)' }) }
          finally { setDeletingRuns(false) }
        }
        const addSelectedToPack = () => {
          const picked = shownRuns.filter((r) => selectedRuns.has(r.id) && r.status === 'succeeded')
          if (!picked.length) { app?.showToast?.({ tone: 'warning', text: '성공한 재현 기록만 증적 팩에 담을 수 있습니다.' }); return }
          picked.forEach((r) => app?.addEvidencePack?.(packFromRun(r)))
          setSelectedRuns(new Set())
          app?.showToast?.({ tone: 'success', text: `${picked.length}건 증적 팩(초안)에 추가` })
        }
        return shownRuns.length ? (
        <div className="table-wrap">
          <BulkActionsBar
            count={selectedRuns.size}
            onClear={() => setSelectedRuns(new Set())}
            actions={[
              ...(app?.can?.('evidence') ? [{ label: '증적 팩(초안)에 추가', onClick: addSelectedToPack }] : []),
              ...(isAdmin ? [{ label: deletingRuns ? '삭제 중…' : '선택 삭제', onClick: doDelete }] : [])
            ]}
          />
          <table className="data-table">
            <thead><tr>
              <th style={{ width: 32 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 선택" /></th>
              <th style={{ width: 44 }}>순번</th>
              <th>실행 ID</th><th>점검 대상</th><th>리스크 항목</th><th>확인 방식</th><th>결과</th><th>대표 증적</th><th>상세</th>
            </tr></thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id} className={selectedRuns.has(r.id) ? 'row-selected' : ''}>
                  <td><input type="checkbox" checked={selectedRuns.has(r.id)} onChange={() => toggle(r.id)} aria-label={`${r.id} 선택`} /></td>
                  <td style={{ color: 'var(--muted,#6b7280)' }}>{page * PAGE + i + 1}</td>
                  <td><code className="inline-code sm">{r.id}</code></td>
                  <td><code className="inline-code sm">{r.serviceEndpoint || r.sscLookupDomain || r.domain || '—'}</code></td>
                  <td>{catalogNameKo(r.issueType)}</td>
                  <td>{r.collector === 'docker' ? '자동 캡처' : r.collector}</td>
                  <td><StatusBadge status={r.status === 'succeeded' ? 'Success' : r.status === 'unsupported' ? 'None' : 'Failed'} /></td>
                  <td>
                    {repRunIds.has(r.id)
                      ? <span className="badge badge-soft badge-success">★ 대표 증적</span>
                      : (app?.can?.('evidence') && r.status === 'succeeded')
                        ? <button className="btn btn-mini" onClick={() => designate(r)}>대표로 지정</button>
                        : <span className="hint-text">—</span>}
                  </td>
                  <td><button className="btn btn-mini" onClick={() => setDrawerRun(r)}>증적 보기</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted,#6b7280)' }}>총 {shownRuns.length}건 · 체크박스로 선택해 증적 팩 담기{isAdmin ? '/삭제' : ''}</span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-mini" disabled={page <= 0} onClick={() => setRunsPage(page - 1)}>← 이전</button>
                <span style={{ fontSize: 12 }}>{page + 1} / {totalPages}</span>
                <button className="btn btn-mini" disabled={page >= totalPages - 1} onClick={() => setRunsPage(page + 1)}>다음 →</button>
              </div>
            )}
          </div>
        </div>
        ) : (
          <EmptyState title="실행 이력 없음" desc="위에서 Risk Finding을 선택해 PoC를 실행하세요." />
        )
      })()}

      {drawerRun && <EvidenceDrawer run={drawerRun} app={app} onClose={() => setDrawerRun(null)} />}
    </div>
  )
}

// 라벨의 영문 Before/After 접두어를 한글로 치환
function labelKo(s) {
  return String(s || '')
    .replace(/^\s*Before\b/i, '조치 전')
    .replace(/^\s*After\b/i, '조치 후')
}

// 실제 캡처 이미지(url)가 있으면 <img>, 없으면 placeholder(MockScreenshot)
function LabShot({ v, fallbackLabel, variant }) {
  const label = labelKo(v?.label || fallbackLabel)
  const [imgError, setImgError] = useState(false)
  if (v?.url && !imgError) {
    return (
      <div className={`lab-shot-card ${variant}`}>
        <div className="lab-shot-frame">
          <img className="lab-shot-img" src={v.url} alt={label} onError={() => setImgError(true)} />
        </div>
        <div className="lab-shot-label">{label} · 실제 캡처</div>
      </div>
    )
  }
  // url이 있었지만 로드 실패(컬렉터 오프라인 등) → 깨진 아이콘 대신 안내 플레이스홀더
  if (v?.url && imgError) {
    return (
      <div className={`lab-shot-card ${variant}`}>
        <div className="lab-shot-frame lab-shot-offline">
          <Icon name="info" size={18} />
          <div className="lab-shot-offline-title">증적 이미지를 불러올 수 없습니다</div>
          <div className="lab-shot-offline-desc">검증랩 컬렉터가 오프라인일 수 있습니다. 잠시 후 다시 시도하세요.</div>
        </div>
        <div className="lab-shot-label">{label}</div>
      </div>
    )
  }
  return <MockScreenshot label={label} variant={variant} height={130} />
}

// verification 명령의 {host}/{port}/{endpoint} 치환
function subCmd(cmd, run) {
  const host = run.sscLookupDomain || run.domain || 'target-host'
  const port = run.port || (run.serviceEndpoint || '').split(':')[1] || '443'
  const endpoint = run.serviceEndpoint || (run.accessUrl || '').replace(/^https?:\/\//, '') || host
  return String(cmd).replace(/\{host\}/g, host).replace(/\{port\}/g, port).replace(/\{endpoint\}/g, endpoint)
}

// Source/Config Diff 렌더 (+/-/컨텍스트 라인 색상). run 있으면 {host}/{port}/{endpoint} 치환.
function ConfigDiff({ diff, run }) {
  if (!diff) return null
  return (
    <div className="config-diff">
      <div className="config-diff-head">
        <span className="config-diff-label">{diff.label}</span>
        {diff.file && <code className="inline-code sm">{diff.file}</code>}
        {diff.focused ? <span className="badge badge-soft badge-green">실제 설정(해당 부분)</span>
          : diff.real === true ? <span className="badge badge-soft badge-green">실제 파일</span>
          : diff.real === false ? <span className="badge badge-soft badge-neutral">랩 서비스 정의</span> : null}
      </div>
      <pre className="config-diff-body">
        {(diff.lines || []).map((ln, i) => (
          <div key={i} className={`cd-line cd-${ln.t}`}>
            <span className="cd-gutter">{ln.t === 'add' ? '+' : ln.t === 'del' ? '-' : ' '}</span>
            <span className="cd-text">{run ? subCmd(ln.s, run) : ln.s}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}

// ── 증적 섹션 조각들 (스크롤형 LabEvidenceView / 단계형 LabEvidenceSteps 공용) ──
//  ※ 조치 가이드 드로어(GuideSteps)도 이 섹션들을 합성 run 으로 재사용 → 문장·헤딩·컴포넌트 일관성.
export function SecOverview({ run, entry, sevKo, showKv }) {
  return (
    <>
      {showKv && (
        <div className="kv compact">
          <div><span>실행 ID</span><b>{run.id}</b></div>
          <div><span>점검 대상(URL)</span><b>{run.accessUrl || run.serviceEndpoint || '—'}</b></div>
          <div><span>SSC 조회 도메인</span><b>{run.sscLookupDomain || run.domain || '—'}</b></div>
          <div><span>확인 방식</span><b>{run.collector === 'docker' ? '자동 캡처' : run.collector} · {run.tool}</b></div>
          <div><span>결과</span><b><StatusBadge status="Success" /></b></div>
        </div>
      )}
      {entry && (() => {
        const meta = guideRowMeta(run.issueType) // 난이도·영향(가이드와 동일 소스)
        return (
        <>
          <div className="mini-title">무엇이 왜 문제인가요</div>
          <div className="issue-summary">
            <div className="issue-summary-chips">
              <span className="chip">항목: {catalogNameKo(run.issueType)}</span>
              <span className={`chip sev-${entry.severity}`}>위험도: {sevKo}</span>
              <span className="chip">분류: {entry.category}</span>
              {meta.difficulty && <span className="chip">조치 난이도: {meta.difficulty}</span>}
              {meta.impact && <span className="chip">서비스 영향: {meta.impact}</span>}
            </div>
            <p className="guide-text">{entry.why}</p>
          </div>
          <ComplianceRef issueType={run.issueType} category={entry.category} />
        </>
        )
      })()}
    </>
  )
}

function SecBeforeAfter({ ev }) {
  return (
    <>
      <div className="mini-title">조치 전 / 조치 후 화면 비교</div>
      <p className="hint-text">왼쪽(조치 전)은 <b>어디가·어떻게 취약한지</b>를, 오른쪽(조치 후)은 <b>그것이 차단·해소됨</b>을 증표로 보여줍니다.</p>
      <div className="ba-cards">
        <LabShot v={ev.visual_before} fallbackLabel="조치 전 (문제 있는 상태)" variant="before" />
        <LabShot v={ev.visual_after} fallbackLabel="조치 후 (개선된 상태)" variant="after" />
      </div>
    </>
  )
}

// 고객 엔진에 맞는 조치 가이드 — 탭(수동선택 기본, SSC 감지 시 힌트 강조)
export function SecFix({ run, entry }) {
  return (
    <>
      {entry?.whereToChange?.length > 0 && (
        <>
          <div className="mini-title">어디를 고쳐야 하나요 (설정 위치)</div>
          <p className="hint-text">아래 위치 <b>중 한 곳</b>에서 적용하면 됩니다(모두 적용하는 것이 아니라, 환경에 맞는 곳 택1).</p>
          <ul className="bullet where-list">
            {entry.whereToChange.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </>
      )}
      {run.sourceDiff ? (
        <>
          <div className="mini-title">실제 소스 변경 (검증랩 타깃의 취약 → 조치 설정)</div>
          <p className="hint-text">
            {run.sourceDiff.focused
              ? '아래는 이 항목에 해당하는 실제 설정 변경입니다 — 검증랩 조치 타깃의 실제 nginx 설정에서 발췌. (이 랩 타깃은 여러 보안 헤더를 함께 적용하지만, 여기서는 이 이슈에 해당하는 줄만 보여줍니다.)'
              : run.sourceDiff.real
                ? '아래는 예시가 아니라, 검증랩이 실제로 세운 취약 타깃과 조치 타깃의 설정 파일 원문 비교입니다. 이 줄을 바꾸면 위 관측값이 실제로 달라집니다.'
                : '아래는 검증랩 타깃의 실제 서비스 정의(취약 → 조치)입니다. 이 설정 차이가 위 관측값(포트 노출)의 직접 원인입니다.'}
          </p>
          <ConfigDiff diff={run.sourceDiff} run={run} />
        </>
      ) : entry?.configDiff ? (
        <>
          <div className="mini-title">설정 변경 예시</div>
          <p className="hint-text">아래는 실제 설정 파일에서 <b>추가(+)/삭제(−)</b>해야 할 부분의 <b>예시</b>입니다(환경마다 경로·형식은 다를 수 있습니다).</p>
          <ConfigDiff diff={entry.configDiff} run={run} />
        </>
      ) : null}

      {/* 고객 엔진에 맞는 적용법 (탭) — 헤더/TLS 계열만, DNS/네트워크는 엔진 무관이라 미표시 */}
      <EngineRemediation run={run} />
    </>
  )
}

// 검증 명령 블록만 분리 — 관측값(실측)이 없는 조치 가이드에서도 재사용.
export function SecVerifyCommands({ run, entry }) {
  if (!(entry?.verification?.length > 0)) return null
  return (
    <>
      <div className="mini-title">조치 여부 확인 방법 (검증 명령)</div>
      <p className="hint-text">조치 후 아래 명령을 실행하면 정상 적용 여부를 직접 확인할 수 있습니다.</p>
      <pre className="verify-block">
        {entry.verification.map((c, i) => (
          <div key={i} className="verify-line"><span className="verify-prompt">$</span> {subCmd(c, run)}</div>
        ))}
      </pre>
    </>
  )
}

function SecObserve({ run, ev, entry }) {
  return (
    <>
      <div className="mini-title">관측값 비교 (조치 전 → 조치 후)</div>
      <BeforeAfterDiff rows={ev.technical_diff || []} />
      <SecVerifyCommands run={run} entry={entry} />
    </>
  )
}

export function SecWrap({ run, entry, includeLog = false }) {
  return (
    <>
      <div className="mini-title">일반 조치 방향 (참고)</div>
      <p className="guide-text">{run.guide?.direction}</p>
      {run.guide?.steps?.length > 0 && (
        <ul className="bullet">{run.guide.steps.map((s) => <li key={s}>{s}</li>)}</ul>
      )}

      <div className="mini-title">고객 조치 체크리스트</div>
      <ul className="action-checklist">
        {(entry?.whereToChange || ['조치 위치 확인']).map((w) => (
          <li key={w}><span className="cbx"><Icon name="square" size={13} /></span> {w}</li>
        ))}
        <li><span className="cbx"><Icon name="square" size={13} /></span> 조치 후 재확인: {entry?.verification?.[0] ? subCmd(entry.verification[0], run) : '검증 명령 실행'}</li>
        <li><span className="cbx"><Icon name="square" size={13} /></span> SecurityScorecard 재스캔으로 최종 해소 확인</li>
      </ul>

      <NoticeBox tone="warning" title="고객 환경 검증이 아닙니다">{run.note}</NoticeBox>

      {includeLog && (
        <>
          <div className="mini-title">실행 로그 (검증랩 내부 수행 기록)</div>
          <pre className="raw-pre">{(run.logs || []).join('\n') || '—'}</pre>
        </>
      )}
    </>
  )
}

// Evidence Pack C영역/Sandbox 공용 — 스크롤형(전체 한 번에). 임베드용.
export function LabEvidenceView({ run, showKv = true }) {
  if (!run) return null
  if (run.status === 'unsupported') return <NoticeBox tone="warning" title={`검증랩 미지원 — ${catalogNameKo(run.issueType)}`}>{run.note}</NoticeBox>
  if (run.status !== 'succeeded' || !run.evidence) return <NoticeBox tone="danger" title={`재현 실패 — ${run.id}`}>{run.note}</NoticeBox>
  const ev = run.evidence
  const entry = catalogEntry(run.issueType)
  const sevKo = entry ? (KO_SEVERITY[entry.severity] || entry.severity) : ''
  return (
    <>
      <SecOverview run={run} entry={entry} sevKo={sevKo} showKv={showKv} />
      <SecFix run={run} entry={entry} />
      <SecBeforeAfter ev={ev} />
      <SecObserve run={run} ev={ev} entry={entry} />
      <SecWrap run={run} entry={entry} />
    </>
  )
}

// 드로어용 — 단계별(다음/이전). 한 번에 한 주제만 보여 가독성↑. flat=인쇄용 전 스텝 세로 나열.
export function LabEvidenceSteps({ run, flat = false }) {
  const [step, setStep] = useState(0)
  if (!run) return null
  if (run.status === 'unsupported') return <NoticeBox tone="warning" title={`검증랩 미지원 — ${catalogNameKo(run.issueType)}`}>{run.note}</NoticeBox>
  if (run.status !== 'succeeded' || !run.evidence) return <NoticeBox tone="danger" title={`재현 실패 — ${run.id}`}>{run.note}</NoticeBox>
  const ev = run.evidence
  const entry = catalogEntry(run.issueType)
  const sevKo = entry ? (KO_SEVERITY[entry.severity] || entry.severity) : ''

  const steps = [
    { key: 'overview', title: '개요', node: <SecOverview run={run} entry={entry} sevKo={sevKo} showKv /> },
    { key: 'fix', title: '조치 방법', node: <SecFix run={run} entry={entry} /> },
    { key: 'ba', title: '조치 전 / 후', node: <SecBeforeAfter ev={ev} /> },
    { key: 'observe', title: '관측값 · 확인', node: <SecObserve run={run} ev={ev} entry={entry} /> },
    { key: 'wrap', title: '마무리', node: <SecWrap run={run} entry={entry} includeLog /> }
  ]
  const cur = Math.min(step, steps.length - 1)

  // flat: 스텝 대신 전 섹션을 세로 나열(GuideSteps flat과 동일 클래스 → 스텝당 1페이지 인쇄 규칙 공유).
  if (flat) {
    return (
      <div className="guide-flat">
        {steps.map((s) => (
          <section key={s.key} className="guide-flat-sec">
            <div className="mini-title guide-flat-h">{s.title}</div>
            {s.node}
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="evi-steps">
      <div className="evi-stepbar">
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={`evi-step-chip ${i === cur ? 'active' : i < cur ? 'done' : ''}`}
            onClick={() => setStep(i)}
          >
            <span className="evi-step-no">{i + 1}</span>{s.title}
          </button>
        ))}
      </div>

      <div className="evi-step-body">{steps[cur].node}</div>

      <div className="evi-step-nav">
        <SecondaryButton onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={cur === 0}>← 이전</SecondaryButton>
        <span className="evi-step-count">{cur + 1} / {steps.length} · {steps[cur].title}</span>
        <PrimaryButton onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} disabled={cur === steps.length - 1}>다음 →</PrimaryButton>
      </div>
    </div>
  )
}

// Evidence 상세 — 대형 슬라이드오버(드로어). 섹션형 문서 레이아웃(탭 아님).
export function EvidenceDrawer({ run, app, onClose }) {
  const saveCandidate = () => {
    app?.showToast?.(`증적 후보로 저장 — ${run.id} (초안 증적)`)
  }
  // 조치 가이드 보기: 지원 항목은 2단계 '조치 방법'에 이미 포함 → 제거.
  // 증적 팩 담기: 재현 기록 표에서 다중선택으로 일원화 → 드로어 단건 버튼 제거.
  const footer = (
    <>
      <SecondaryButton onClick={saveCandidate}>증적 후보로 저장</SecondaryButton>
      <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
    </>
  )

  return (
    <Drawer
      title={`참고 증적 — ${catalogNameKo(run.issueType)}`}
      subtitle={`${run.id} · 점검 대상: ${run.accessUrl || run.serviceEndpoint || '—'} · SSC 조회: ${run.sscLookupDomain || run.domain || '—'} · 항목코드 ${run.issueType}`}
      badges={<>
        <span className="badge badge-soft badge-purple">참고용 시연</span>
        <span className="badge badge-soft badge-purple">초안 증적</span>
        <span className="badge badge-soft badge-neutral">고객환경 검증 아님</span>
        <span className="badge badge-soft badge-neutral">일반 가이드</span>
        <span className="badge badge-soft badge-neutral">읽기 전용</span>
      </>}
      onClose={onClose}
      footer={footer}
      width="lg"
    >
      <NoticeBox tone="info">
        이 문서는 파트너 검증랩에서 <b>같은 문제를 재현</b>해 <b>조치 전 → 조치 후</b>를 비교로 보여주는 참고 자료입니다.
        고객 시스템을 실제로 바꾸거나 검증한 것은 아니며, 실제 해소 여부는 <b>SecurityScorecard 재스캔</b>으로 확인합니다.
      </NoticeBox>

      <LabEvidenceSteps run={run} />
    </Drawer>
  )
}
