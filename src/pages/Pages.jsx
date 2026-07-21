// =====================================================================
// 화면(페이지) 컴포넌트 모음
// 모든 데이터는 mock data. 실제 API/DB/Docker/AI 호출 없음.
// =====================================================================
import React, { useState, useEffect } from 'react'
import * as data from '../data/mock.js'
import {
  StatCard,
  DataTable,
  StatusBadge,
  SeverityBadge,
  EvidenceCard,
  Drawer,
  Modal,
  Field,
  CodeBlock,
  BeforeAfterDiff,
  Stepper,
  BanCheckList,
  ActivityLog,
  EmptyState,
  MockScreenshot,
  NoticeBox,
  EndpointContext,
  SectionTitle,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  ProgressTimeline,
  SourceBadge,
  TagBadge,
  ImportProgressPanel,
  RegistrationSummaryCard,
  FilterBar,
  applyFilters,
  BulkActionsBar,
  exportRowsToCsv,
  ScoreBadge
} from '../components/common.jsx'
import { getScore, useScore } from '../lib/sscScore.js'
import { getIssueTypeSummary, primeIssueTypeSummary } from '../lib/sscFindings.js'
import { fetchSharedPack, newShareFields, fetchUsers, apiCreateUser, apiSetUserRole, apiUpdateUser, apiResetUserPassword, sscTokenStatus, sscTokenSet, sscTokenClear, fetchAudit } from '../lib/portalApi.js'
import { loadInterpretation, cachedInterpretation } from '../lib/interpret.js'
import { catalogNameKo, factorNameKo, catalogEntry, canonicalIssueKey, catalogGroups, KO_SEVERITY } from '../data/sandboxCatalog.js'
import { getRemediationGuide, GUIDE_ISSUE_TYPES, guideRowMeta } from '../data/remediationSteps.js'
import { frameworksForCategory, complianceByIndustry } from '../data/compliance.js'
import { SscBackendImport, SscSmokeTest, RiskFindingsRealPanel, IssueTypeSummary } from '../features/SscApi.jsx'
import { ENABLE_DEV_MOCKS } from '../config/runtime.js'
import { ValidationSandboxRealPanel, LabEvidenceView, LabEvidenceSteps, SecOverview, SecFix, SecVerifyCommands, SecWrap } from '../features/Lab.jsx'
import { GUIDES as LAB_GUIDES, guideKey as labGuideKey } from '../../backend/src/remediationGuides.js' // 조치 방향 SSOT(검증랩과 공유)
import { collectRiskFindings } from '../lib/sscApi.js' // 고객사 우선 스코프(리스크 유형 필터)용
import { Icon } from '../components/icons.jsx'
import { EngineRemediation } from '../components/EngineRemediation.jsx'
import { ComplianceRef, DeliveryCompliance } from '../components/ComplianceRef.jsx'
import { engineGuide } from '../data/engineGuides.js'

// 대시보드 프로세스 단계 / 지표 → 아이콘 이름 매핑
const PROC_ICON = { 1: 'customers', 2: 'domains', 3: 'collect', 4: 'findings', 5: 'sandbox', 6: 'evidence', 7: 'customer-view', 8: 'remediation', 9: 'rescan' }
const STAT_ICON = { customers: 'customers', domains: 'domains', evidenceAll: 'evidence', evidenceReady: 'evidence', newFindings: 'findings', sandboxRate: 'sandbox', reobservation: 'rescan' }
import { getLabRun } from '../lib/labApi.js'

// 공통 고지 문구 박스
function LegalFooter() {
  return (
    <div className="legal-footer">
      <span className="legal-icon"><Icon name="info" size={14} /></span>
      <p>{data.LEGAL_NOTICE}</p>
    </div>
  )
}

// ---------------------------------------------------------------------
// 1. Dashboard
// ---------------------------------------------------------------------
const DASH_KIND_KO = { user: '사용자', system: '시스템', security: '보안' }
const dashHM = (ts) => { try { return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) } catch { return '' } }

export function Dashboard({ app }) {
  const { navigate } = app
  // 실집계: 등록 고객·도메인·증적 팩(백엔드 실데이터)
  const customers = app.customers || []
  const domains = app.domains || []
  const packs = app.evidencePacks || []
  const included = packs.filter((p) => p.excluded !== true)
  const bySource = (s) => packs.filter((p) => p.source === s).length
  const stats = [
    { key: 'customers', label: '등록 고객 수', value: customers.length, unit: '개사', tone: 'primary' },
    { key: 'domains', label: '등록 도메인 수', value: domains.length, unit: '개', tone: 'primary' },
    { key: 'evidenceAll', label: '증적 팩 (전체)', value: packs.length, unit: '건', tone: 'primary' },
    { key: 'evidenceReady', label: '전달 포함 증적 팩', value: included.length, unit: '건', tone: 'success' }
  ]
  const queues = [
    { key: 'toDeliver', label: '전달 포함 증적 팩', count: included.length, tone: 'success', desc: '고객 전달 화면에 노출되는 팩', hint: '고객 전달 화면', nav: 'delivery' },
    { key: 'excluded', label: '전달 제외 증적 팩', count: packs.length - included.length, tone: 'neutral', desc: '전달에서 제외된 팩(내부 보관)', hint: '증적 팩', nav: 'packs' },
    { key: 'lab', label: '검증랩 참고 증적', count: bySource('lab'), tone: 'purple', desc: '검증랩에서 수집한 조치 전·후 증적', hint: '증적 팩', nav: 'packs' },
    { key: 'guide', label: '조치 권고 (가이드)', count: bySource('guide'), tone: 'warning', desc: '일반 조치 권고 가이드 팩', hint: '조치 가이드', nav: 'guides' }
  ]
  // 최근 활동: 실제 감사 로그(사용자·시스템·보안). 관리자만 조회 가능 → 실패 시 안내.
  const [activity, setActivity] = useState([])
  const [actStatus, setActStatus] = useState('loading')
  useEffect(() => {
    let alive = true
    fetchAudit({ limit: 6 })
      .then((d) => {
        if (!alive) return
        const items = (d.items || []).map((e) => ({
          time: dashHM(e.ts),
          actor: e.actor || 'system',
          role: DASH_KIND_KO[e.kind] || e.kind,
          text: e.action + (e.target ? ` · ${e.target}` : ''),
          tone: (e.result === 'Denied' || e.result === 'Failed' || e.result === 'Fallback') ? 'warning' : (e.kind === 'system' ? 'neutral' : 'primary')
        }))
        setActivity(items)
        setActStatus(items.length ? 'ok' : 'empty')
      })
      .catch(() => { if (alive) setActStatus('error') })
    return () => { alive = false }
  }, [])
  return (
    <div className="page">
      <PageHeader
        title="대시보드"
        desc="외부 관측 리스크부터 고객 전달 및 SSC 재스캔까지의 파트너 운영 흐름을 요약합니다."
      />

      {/* 전체 운영 프로세스 (10단계) */}
      <div className="card process-card">
        <SectionTitle
          kicker="운영 흐름"
          title="전체 운영 프로세스"
          action={<span className="hint-text">고객사 등록 → 고객 전달 → SSC 재스캔/공식 검증</span>}
        />
        <div className="process-flow">
          {data.processFlow.map((p, i) => (
            <React.Fragment key={p.step}>
              <button className="process-step" onClick={() => navigate(p.nav)} title={p.desc}>
                <div className="process-icon"><Icon name={PROC_ICON[p.step] || p.nav} size={22} /></div>
                <div className="process-label">{p.label}</div>
              </button>
              {i < data.processFlow.length - 1 && <span className="process-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <SectionTitle
        kicker="핵심 지표"
        title="운영 지표 요약"
        action={<span className="hint-text">등록·증적 데이터 기준 실집계</span>}
      />
      <div className="stat-grid">
        {stats.map(({ key, ...s }) => (
          <StatCard key={key} icon={<Icon name={STAT_ICON[key] || 'dashboard'} size={19} />} {...s} />
        ))}
      </div>

      <div className="dash-cols">
        <div className="dash-main">
          <SectionTitle kicker="증적 팩 현황" title="증적 팩 현황" action={<span className="hint-text">현재 등록된 증적 팩 실집계</span>} />
          <div className="queue-grid">
            {queues.map((q) => (
              <button key={q.key} className="queue-card" onClick={() => navigate(q.nav)}>
                <div className="queue-top">
                  <span className="queue-label">{q.label}</span>
                  <span className={`badge badge-soft badge-${q.tone} queue-pill`}>{q.count}건</span>
                </div>
                <div className="queue-desc">{q.desc}</div>
                <div className="queue-hint">↳ {q.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="dash-side">
          <SectionTitle kicker="최근 활동" title="최근 활동" action={<span className="hint-text">감사 로그</span>} />
          <div className="card">
            {actStatus === 'ok' && <ActivityLog items={activity} />}
            {actStatus === 'loading' && <p className="hint-text" style={{ padding: 12 }}>불러오는 중…</p>}
            {actStatus === 'empty' && <EmptyState title="최근 활동 없음" desc="사용자·시스템·보안 이벤트가 기록되면 표시됩니다." />}
            {actStatus === 'error' && <EmptyState title="활동 내역을 불러올 수 없음" desc="관리자 권한이 필요하거나 서버에 연결할 수 없습니다." />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// 2. Customers
// ---------------------------------------------------------------------
export function Customers({ app }) {
  const customers = app.customers
  const [detail, setDetail] = useState(null) // 선택된 고객 (상세 팝업)
  const [filters, setFilters] = useState([])
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState([]) // 일괄 선택된 id
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]
  const filterFields = [
    { key: 'industry', label: '산업군', type: 'select', options: uniq(customers.map((c) => c.industry)) },
    { key: 'status', label: '계정 상태', type: 'select', options: uniq(customers.map((c) => c.status)) },
    { key: 'contactName', label: '고객담당자', type: 'select', options: uniq(customers.map((c) => c.contactName || c.engineer)), get: (c) => c.contactName || c.engineer },
    { key: 'name', label: '고객사명', type: 'text' }
  ]
  const rows = applyFilters(customers, filters, filterFields, search, ['name', 'industry'])

  // 고객사별 대표 도메인(SSC 조회 기준) → SSC 점수(등급) 조회
  const domainFor = (c) => {
    const d = (app.domains || []).find((x) => x.customer === c.name)
    return d ? (d.sscLookupDomain || (d.serviceEndpoint || d.primary || '').split(':')[0]) : null
  }
  const [scores, setScores] = useState({}) // customerId -> {score,grade}|null|undefined
  useEffect(() => {
    let alive = true
    customers.forEach((c) => { getScore(domainFor(c)).then((s) => { if (alive) setScores((p) => ({ ...p, [c.id]: s })) }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, app.domains])

  const columns = [
    { key: 'name', label: '고객사명' },
    { key: 'industry', label: '산업군' },
    { key: 'score', label: 'SSC 점수', get: (r) => { const s = scores[r.id]; return s ? `${s.grade || ''} ${s.score ?? ''}`.trim() : '' } },
    { key: 'domains', label: '도메인 수' },
    { key: 'openRisks', label: '미조치 리스크' },
    { key: 'lastCheck', label: '최근 점검일' },
    { key: 'contactName', label: '고객담당자', get: (r) => r.contactName || r.engineer || '' },
    { key: 'status', label: '계정 상태' }
  ]
  const selectedRows = rows.filter((r) => sel.includes(r.id))
  const bulkActions = [
    { label: `CSV로 내보내기 (${sel.length})`, onClick: () => exportRowsToCsv(selectedRows, columns, 'customers.csv') },
    ...(app.can?.('customers') ? [{ label: '일괄 삭제 (in-memory)', danger: true, onClick: () => {
      if (window.confirm(`선택한 고객사 ${sel.length}개를 삭제할까요? (in-memory · SSC 삭제 API 미호출)`)) {
        sel.forEach((id) => app.deleteCustomer(id)); setSel([])
      }
    } }] : [])
  ]

  const renderCell = (key, row) => {
    if (key === 'status') return <StatusBadge status={row.status} />
    if (key === 'score') { const s = scores[row.id]; return <ScoreBadge score={s?.score} grade={s?.grade} loading={s === undefined} /> }
    if (key === 'openRisks')
      return <span className={row.openRisks > 0 ? 'num-warn' : 'num-ok'}>{row.openRisks}</span>
    if (key === 'name')
      return (
        <span>
          <strong className="cust-name-link">{row.name}</strong>
          {row.isNew && <span className="badge badge-soft badge-success new-tag">방금 등록됨</span>}
        </span>
      )
    if (key === 'contactName') return row.contactName || row.engineer || '—'
    return row[key]
  }

  return (
    <div className="page">
      <PageHeader
        title="고객사"
        desc="등록 고객사 및 점검 현황 — 모든 업무의 시작점 (고객사명 클릭 시 상세)"
        actions={app.can?.('customers') ? <PrimaryButton onClick={app.openCustomerWizard}>+ 고객사 등록</PrimaryButton> : null}
      />

      {app.newCustomerId && customers.find((c) => c.id === app.newCustomerId)?.isNew && (
        <NoticeBox tone={app.persistMode === 'backend' ? 'success' : 'info'} title={app.persistMode === 'backend' ? '방금 등록된 고객 (저장됨)' : '방금 등록된 고객 (미저장)'}>
          <b>{customers.find((c) => c.id === app.newCustomerId)?.name}</b> 이(가) 목록 상단에 추가되었습니다
          {app.persistMode === 'backend' ? ' — 백엔드에 영구 저장됨' : ' (Backend 미연결: 메모리에만 반영)'}. 다음 단계:
          도메인/스코프 확인 → <b>Risk Findings</b> 수집.
        </NoticeBox>
      )}

      <FilterBar
        fields={filterFields}
        filters={filters}
        onChange={setFilters}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="고객사명 · 산업군 검색"
        resultCount={rows.length}
      />
      <BulkActionsBar count={sel.length} actions={bulkActions} onClear={() => setSel([])} />
      <div className="card no-pad">
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(row) => setDetail(row)}
          renderCell={renderCell}
          selectable
          selected={sel}
          onSelectedChange={setSel}
          pageSize={10}
        />
      </div>

      {detail && (
        <CustomerDetailDrawer
          row={detail}
          scoreDomain={domainFor(detail)}
          canWrite={app.can?.('customers')}
          onClose={() => setDetail(null)}
          onEdit={() => { app.openCustomerEdit(detail); setDetail(null) }}
          onDelete={() => {
            if (window.confirm(`고객사 "${detail.name}"을(를) 삭제할까요?`)) {
              app.deleteCustomer(detail.id)
              setDetail(null)
            }
          }}
        />
      )}
    </div>
  )
}

function CustomerDetailDrawer({ row, scoreDomain, canWrite, onClose, onEdit, onDelete }) {
  const s = useScore(scoreDomain)
  const footer = (
    <>
      {canWrite && <SecondaryButton className="foot-left" onClick={onDelete}>고객사 삭제</SecondaryButton>}
      <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
      {canWrite && <PrimaryButton onClick={onEdit}>수정</PrimaryButton>}
    </>
  )
  return (
    <Drawer
      title={row.name}
      subtitle={`고객 ID: ${row.id}`}
      badges={<><StatusBadge status={row.status} /><ScoreBadge score={s?.score} grade={s?.grade} loading={s === undefined} /></>}
      onClose={onClose}
      footer={footer}
      width="md"
    >
      <div className="mini-title">고객 기본 정보</div>
      <div className="kv">
        <div><span>고객 ID</span><b>{row.id}</b></div>
        <div><span>산업군</span><b>{row.industry}</b></div>
        <div><span>SSC 보안등급</span><b><ScoreBadge score={s?.score} grade={s?.grade} loading={s === undefined} /></b></div>
        <div><span>도메인 수</span><b>{row.domains}</b></div>
        <div><span>미조치 리스크</span><b className="num-warn">{row.openRisks}</b></div>
        <div><span>최근 점검일</span><b>{row.lastCheck}</b></div>
        <div><span>고객담당자</span><b>{row.contactName || row.engineer || '—'}</b></div>
        <div><span>계정 상태</span><b><StatusBadge status={row.status} /></b></div>
        <div><span>연락처</span><b>{row.contact}</b></div>
      </div>

      {row.note && (
        <>
          <div className="mini-title">점검 메모</div>
          <div className="note-block">{row.note}</div>
        </>
      )}
    </Drawer>
  )
}

// ---------------------------------------------------------------------
// 3. Domains & Scope
// ---------------------------------------------------------------------
// 도메인 필드 접근자 (구/신 스키마 호환)
const domLookup = (r) => r.sscLookupDomain || (r.primary || '').split(':')[0]
const domEndpoint = (r) => r.serviceEndpoint || r.primary || ''

// 조치 가이드 행 + 선택 대상 → 증적 팩(초안). 랩 실행이 아니므로 조치 권고 중심(before/after 증적 없음).
//  id 는 {이슈유형, 도메인} 기준 안정값 → 재추가 시 덮어씀(dedup).
function packFromGuide(row, target) {
  const now = new Date().toISOString().slice(0, 10)
  const dom = domLookup(target) || '—'
  const ep = domEndpoint(target)
  return {
    id: 'EP-GUIDE-' + String(row.key) + '-' + String(dom).replace(/[^a-z0-9]/gi, '').slice(0, 16),
    title: `${row.name} — 조치 권고 (가이드)`,
    customer: target.customer || '—',
    domain: dom,
    serviceEndpoint: ep || null,
    accessUrl: target.accessUrl || target.baseUrl || (ep ? `https://${ep}` : null),
    sscLookupDomain: dom,
    riskCount: 1,
    created: now,
    review: 'In Review',
    publish: 'Draft',
    customerViewed: '미열람',
    source: 'guide',
    issueType: row.key,
    category: row.category
  }
}

export function Domains({ app }) {
  const domains = app.domains
  const [detail, setDetail] = useState(null) // 선택된 도메인 row (드로어)
  const [filters, setFilters] = useState([])
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState([])

  // 전역 FilterBar 필드 정의 (필드 추가 시 여기에 한 줄만 추가)
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]
  const filterFields = [
    { key: 'customer', label: '고객사', type: 'select', options: uniq(domains.map((d) => d.customer)) },
    { key: 'status', label: '수집 상태', type: 'select', options: uniq(domains.map((d) => d.status)) },
    { key: 'consent', label: '점검 동의', type: 'select', options: uniq(domains.map((d) => d.consent)) },
    { key: 'serviceEndpoint', label: '서비스 Endpoint', type: 'text', get: domEndpoint },
    { key: 'sscLookupDomain', label: 'SSC 조회 기준', type: 'text', get: domLookup }
  ]
  const rows = applyFilters(domains, filters, filterFields, search, ['serviceEndpoint', 'sscLookupDomain', 'customer'])

  // Endpoint(도메인)별 SSC 점수 조회 — 점수는 도메인(host) 단위
  const [scores, setScores] = useState({}) // domainId -> {score,grade}|null|undefined
  useEffect(() => {
    let alive = true
    domains.forEach((d) => { getScore(domLookup(d)).then((s) => { if (alive) setScores((p) => ({ ...p, [d.id]: s })) }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains])

  const columns = [
    { key: 'customer', label: '고객사' },
    { key: 'serviceEndpoint', label: '서비스 Endpoint', get: domEndpoint },
    { key: 'sscLookupDomain', label: 'SSC 조회 기준', get: domLookup },
    { key: 'score', label: 'SSC 점수', get: (r) => { const s = scores[r.id]; return s ? `${s.grade || ''} ${s.score ?? ''}`.trim() : '' } },
    { key: 'allow', label: '허용 URL' },
    { key: 'status', label: '수집 상태' }
  ]
  const selectedRows = rows.filter((r) => sel.includes(r.id))
  const bulkActions = [
    { label: `CSV로 내보내기 (${sel.length})`, onClick: () => exportRowsToCsv(selectedRows, columns, 'domains.csv') },
    ...(app.can?.('domains') ? [{ label: '일괄 제거 (in-memory)', danger: true, onClick: () => {
      if (window.confirm(`선택한 도메인 ${sel.length}개를 목록에서 제거할까요? (in-memory · SSC 삭제 API 미호출)`)) {
        sel.forEach((id) => app.deleteDomain(id)); setSel([])
      }
    } }] : [])
  ]
  const renderCell = (key, row) => {
    if (key === 'serviceEndpoint')
      return (
        <span>
          <code className="inline-code">{row.serviceEndpoint || row.primary}</code>
          {row.port && <span className="badge badge-soft badge-purple new-tag">:{row.port}</span>}
          {row.isNew && <span className="badge badge-soft badge-success new-tag">신규</span>}
        </span>
      )
    if (key === 'sscLookupDomain')
      return <code className="inline-code sm">{row.sscLookupDomain || (row.primary || '').split(':')[0]}</code>
    if (key === 'score') { const s = scores[row.id]; return <ScoreBadge score={s?.score} grade={s?.grade} loading={s === undefined} /> }
    if (key === 'accessUrl')
      return <code className="inline-code sm">{row.accessUrl || row.baseUrl || '—'}</code>
    if (key === 'allow')
      return (
        <div className="url-list">
          {(row.allow || []).slice(0, 2).map((u) => (
            <code key={u} className="inline-code sm">{u}</code>
          ))}
          {(row.allow || []).length > 2 && <span className="muted-cell">+{row.allow.length - 2}</span>}
          {(!row.allow || row.allow.length === 0) && <span className="muted-cell">—</span>}
        </div>
      )
    if (key === 'consent') return <StatusBadge status={row.consent} />
    if (key === 'status') return <span className="status-cell"><StatusBadge status={row.status} />{row.riskCount != null && <span className="muted-cell"> · {row.riskCount}건{row.lastCollectedAt ? ` · ${row.lastCollectedAt}` : ''}</span>}</span>
    return row[key]
  }
  return (
    <div className="page">
      <PageHeader
        title="도메인 등록"
        desc="고객별 서비스 주소(Endpoint) · SSC 조회 도메인 · 접속 확인 URL · 점검 허용 범위 관리"
        actions={app.can?.('domains') ? <PrimaryButton onClick={() => app.openDomainModal()}>+ 도메인 등록</PrimaryButton> : null}
      />
      <FilterBar
        fields={filterFields}
        filters={filters}
        onChange={setFilters}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Endpoint · SSC 조회 기준 · 고객사 검색"
        resultCount={rows.length}
      />
      <BulkActionsBar count={sel.length} actions={bulkActions} onClear={() => setSel([])} />
      <div className="card no-pad">
        <DataTable columns={columns} rows={rows} renderCell={renderCell} onRowClick={setDetail} selectable selected={sel} onSelectedChange={setSel} pageSize={10} />
      </div>
      <p className="hint-text">행을 클릭하면 상세/수정(점검 동의 포함) 화면이 열립니다. 등록 후 <b>SSC API Risk Import 대기</b> 상태로 표시되며, <b>Risk Findings</b>에서 SSC Risk 수집으로 Finding이 생성됩니다.</p>

      {detail && (
        <DomainDetailDrawer
          row={detail}
          canWrite={app.can?.('domains')}
          onClose={() => setDetail(null)}
          onEdit={() => { app.openDomainEdit(detail); setDetail(null) }}
          onDelete={() => {
            if (window.confirm(`도메인 "${detail.serviceEndpoint || detail.primary}"을(를) 목록에서 제거할까요? (in-memory 제거 · SSC 삭제 API 미호출)`)) {
              app.deleteDomain(detail.id)
              setDetail(null)
            }
          }}
        />
      )}
    </div>
  )
}

function DomainDetailDrawer({ row, canWrite, onClose, onEdit, onDelete }) {
  const footer = (
    <>
      {canWrite && <SecondaryButton className="foot-left" onClick={onDelete}>이 도메인 제거</SecondaryButton>}
      <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
      {canWrite && <PrimaryButton onClick={onEdit}>수정</PrimaryButton>}
    </>
  )
  return (
    <Drawer
      title={row.serviceEndpoint || row.primary}
      subtitle={`고객사: ${row.customer}`}
      badges={<>
        <StatusBadge status={row.status} />
        <StatusBadge status={row.consent} />
        {row.port && <span className="badge badge-soft badge-purple">:{row.port} 포트 보존</span>}
      </>}
      onClose={onClose}
      footer={footer}
      width="md"
    >
      <div className="mini-title">Endpoint 모델</div>
      <div className="kv">
        <div><span>고객사</span><b>{row.customer}</b></div>
        <div><span>서비스 Endpoint</span><b>{row.serviceEndpoint || row.primary}</b></div>
        <div><span>SSC 조회 기준</span><b>{row.sscLookupDomain || (row.primary || '').split(':')[0]}</b></div>
        <div><span>접속 검증 URL</span><b>{row.accessUrl || row.baseUrl || '—'}</b></div>
        <div><span>점검 동의</span><b><StatusBadge status={row.consent} /></b></div>
        <div><span>수집 상태</span><b><StatusBadge status={row.status} />{row.riskCount != null && <span className="muted-cell"> · 리스크 {row.riskCount}건</span>}</b></div>
        {row.lastCollectedAt && <div><span>최근 수집</span><b>{row.lastCollectedAt}</b></div>}
      </div>

      <div className="mini-title">허용 URL</div>
      <div className="url-list">
        {(row.allow || []).map((u) => <code key={u} className="inline-code sm">{u}</code>)}
        {(!row.allow || !row.allow.length) && <span className="muted-cell">—</span>}
      </div>
      <div className="mini-title">제외 URL</div>
      <div className="url-list">
        {(row.deny || []).map((u) => <code key={u} className="inline-code sm">{u}</code>)}
        {(!row.deny || !row.deny.length) && <span className="muted-cell">—</span>}
      </div>

      <NoticeBox tone="info">
        SSC API 조회는 <b>SSC 조회 기준(host)</b>, Partner Lab PoC·접속 검증은 <b>접속 검증 URL(host:port)</b>을 사용합니다.
        Partner Lab PoC 실행 시 화면 캡처·네트워크 요약은 기본 수집되며, 원본 HAR 저장은 민감정보 보호를 위해 일반 화면에서 설정하지 않습니다.
      </NoticeBox>
    </Drawer>
  )
}

// ---------------------------------------------------------------------
// 4. Risk Findings (목록)
// ---------------------------------------------------------------------
export function RiskFindings({ app }) {
  // Domains와 동일한 목록 구성: 등록 Endpoint 행 → 클릭 시 드로어에서 SSC Risk 수집·상세.
  const [mode, setMode] = useState('real') // 'mock' | 'real'
  const [target, setTarget] = useState(null) // 선택 Endpoint row (드로어)
  const [sel, setSel] = useState([]) // 일괄 선택된 id
  const [filters, setFilters] = useState([])
  const [search, setSearch] = useState('')
  const domains = app.domains
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]
  const filterFields = [
    { key: 'customer', label: '고객사', type: 'select', options: uniq(domains.map((d) => d.customer)) },
    { key: 'status', label: '수집 상태', type: 'select', options: uniq(domains.map((d) => d.status)) },
    { key: 'serviceEndpoint', label: '서비스 Endpoint', type: 'text', get: domEndpoint },
    { key: 'sscLookupDomain', label: 'SSC 조회 기준', type: 'text', get: domLookup }
  ]
  const rows = applyFilters(domains, filters, filterFields, search, ['serviceEndpoint', 'sscLookupDomain', 'customer'])
  const columns = [
    { key: 'customer', label: '고객사' },
    { key: 'serviceEndpoint', label: '서비스 Endpoint', get: domEndpoint },
    { key: 'sscLookupDomain', label: 'SSC 조회 기준', get: domLookup },
    { key: 'status', label: '수집 상태' }
  ]
  const renderCell = (key, row) => {
    if (key === 'serviceEndpoint')
      return <span><code className="inline-code">{domEndpoint(row)}</code>{row.port && <span className="badge badge-soft badge-purple new-tag">:{row.port}</span>}</span>
    if (key === 'sscLookupDomain') return <code className="inline-code sm">{domLookup(row)}</code>
    if (key === 'status') return <StatusBadge status={row.status} />
    return row[key]
  }
  return (
    <div className="page">
      <PageHeader
        title="리스크 점검"
        desc="등록된 서비스 주소를 클릭하면 해당 주소의 SecurityScorecard 리스크(읽기 전용)를 수집·확인합니다."
        actions={
          ENABLE_DEV_MOCKS ? (
            <div className="mode-toggle">
              <button className={`mode-btn ${mode === 'real' ? 'active' : ''}`} onClick={() => setMode('real')}>Real SSC API</button>
              <button className={`mode-btn ${mode === 'mock' ? 'active' : ''}`} onClick={() => setMode('mock')}>Developer Mock</button>
            </div>
          ) : null
        }
      />
      {ENABLE_DEV_MOCKS && mode === 'mock' ? (
        <>
          <NoticeBox tone="warning" title="Developer Mock Samples">
            UI 개발·회귀 테스트용 예시 데이터입니다. 실제 SecurityScorecard API 결과가 아닙니다
            (<code className="inline-code sm">VITE_ENABLE_DEV_MOCKS=true</code>).
          </NoticeBox>
          <div className="card no-pad">
            <DataTable
              columns={[{ key: 'risk', label: '리스크 항목' }, { key: 'customer', label: '고객사' }, { key: 'severity', label: '위험도' }, { key: 'state', label: '상태' }]}
              rows={app.findings || data.findings}
              renderCell={(key, row) => key === 'severity' ? <SeverityBadge level={row.severity} /> : key === 'state' ? <StatusBadge status={row.state} /> : key === 'risk' ? <strong>{row.risk}</strong> : row[key]}
              onRowClick={(row) => app.navigate('finding-detail', row.id)}
            />
          </div>
        </>
      ) : (
        <>
          <FilterBar
            fields={filterFields}
            filters={filters}
            onChange={setFilters}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Endpoint · SSC 조회 기준 · 고객사 검색"
            resultCount={rows.length}
          />
          <BulkActionsBar
            count={sel.length}
            actions={[{ label: `CSV로 내보내기 (${sel.length})`, onClick: () => exportRowsToCsv(rows.filter((r) => sel.includes(r.id)), columns, 'risk-scan.csv') }]}
            onClear={() => setSel([])}
          />
          <div className="card no-pad">
            <DataTable columns={columns} rows={rows} onRowClick={setTarget} renderCell={renderCell} selectable selected={sel} onSelectedChange={setSel} pageSize={10} />
          </div>
          <p className="hint-text">행(Endpoint)을 클릭하면 SSC Risk 수집·상세가 열립니다.</p>
          {target && <EndpointRiskDrawer row={target} app={app} onClose={() => setTarget(null)} />}
        </>
      )}
    </div>
  )
}

// 등록 Endpoint 클릭 → 드로어에서 해당 Endpoint의 SSC Risk 수집·표시
function EndpointRiskDrawer({ row, app, onClose }) {
  const serviceEndpoint = domEndpoint(row)
  const sscLookupDomain = domLookup(row)
  const accessUrl = row.accessUrl || row.baseUrl || (serviceEndpoint ? `https://${serviceEndpoint}` : '')
  const context = { customer: row.customer, domainId: row.id, serviceEndpoint, sscLookupDomain, accessUrl }
  return (
    <Drawer
      title={serviceEndpoint}
      subtitle={`고객사: ${row.customer} · SSC 조회 기준: ${sscLookupDomain}`}
      badges={<><StatusBadge status={row.status} />{row.port && <span className="badge badge-soft badge-purple">:{row.port} 포트 보존</span>}</>}
      onClose={onClose}
      width="lg"
      footer={<SecondaryButton onClick={onClose}>닫기</SecondaryButton>}
    >
      <RiskFindingsRealPanel presetDomain={sscLookupDomain} context={context} app={app} />
    </Drawer>
  )
}

// ---------------------------------------------------------------------
// 5. Risk Finding 상세 (가장 중요한 화면 — 4개 영역)
// ---------------------------------------------------------------------
export function FindingDetail({ findingId, app }) {
  const pool = app?.findings || []
  const finding = pool.find((f) => f.id === findingId) || (ENABLE_DEV_MOCKS ? data.findings.find((f) => f.id === findingId) : null) || pool[0]
  // 리스크 미수집(빈 풀) 또는 해당 리스크 없음 → 목업 대신 빈 상태 안내
  if (!finding) {
    return (
      <div className="page">
        <PageHeader title="리스크 상세" desc="선택한 리스크를 찾을 수 없습니다." />
        <div className="card">
          <EmptyState title="리스크 수집 전" desc="이 도메인의 SecurityScorecard 리스크가 아직 수집되지 않았습니다. 리스크 점검 화면에서 대상 서비스 주소를 선택해 수집하세요." />
          <div style={{ padding: '0 16px 16px' }}><SecondaryButton onClick={() => app.navigate('findings')}>리스크 점검으로 이동</SecondaryButton></div>
        </div>
      </div>
    )
  }
  const detail = data.findingDetails[finding.id] || data.findingDetails['RF-1001']
  const obs = detail.observation
  const guide = detail.guide
  const lab = detail.lab
  const ssc = detail.ssc || data.findingDetails['RF-1001'].ssc

  // currentState → Source Timeline 위치 매핑
  const STATE_TO_TL = {
    'SSC Risk Imported': 'import',
    'External Observation Added': 'observe',
    'Advisory Drafted': 'advisory',
    'Partner Lab PoC Ready': 'poc',
    'Evidence Pack Ready': 'evidence',
    'Delivered to Customer': 'delivery',
    'Customer Remediation In Progress': 'remediation',
    'SSC 재스캔 필요': 'rescan-req',
    'SSC Re-scan Confirmed': 'rescan-ok'
  }
  const tlKey = STATE_TO_TL[detail.currentState] || 'poc'

  return (
    <div className="page">
      <button className="back-link" onClick={() => app.navigate('findings')}>← Risk Findings 목록</button>
      <PageHeader
        title={finding.risk}
        desc={`${finding.customer} · ${finding.id}`}
        actions={<SeverityBadge level={finding.severity} />}
      />

      {/* SSC Finding Import 맥락 요약 카드 */}
      <div className="card ssc-context-card">
        <div className="ssc-context-head">
          <SourceBadge source={finding.source || 'SecurityScorecard API'} />
          <span className="hint-text">본 Finding의 수집 맥락</span>
        </div>
        <RegistrationSummaryCard
          rows={[
            { label: 'Source', value: finding.source || 'SecurityScorecard API' },
            { label: 'SSC Factor', value: ssc.factor },
            { label: 'SSC Issue Type', value: ssc.issueType },
            { label: 'Imported At', value: ssc.importedAt },
            { label: 'Score Impact', value: ssc.scoreImpact },
            { label: 'Current Workflow', value: detail.currentState }
          ]}
        />
        <p className="guide-text" style={{ marginTop: 12, marginBottom: 0 }}>
          본 Finding은 SecurityScorecard API를 통해 수집된 리스크 항목이며, 고객 도메인 외부 관측값과 <b>파트너 표준
          검증랩 참고용 PoC 증적</b>을 결합하여 Evidence Pack으로 구성됩니다. 파트너 랩 증적은 고객 환경 조치 완료를
          의미하지 않으며, 실제 Finding 해소 여부는 <b>SecurityScorecard 재스캔/공식 검증</b>으로 확인합니다.
        </p>
      </div>

      {/* Source Timeline (10단계) */}
      <div className="card">
        <SectionTitle kicker="SOURCE TIMELINE" title="수집 → 참고 증적 → 전달 → SSC 재스캔 흐름" />
        <div className="timeline-h">
          <ProgressTimeline items={data.sourceTimeline} currentKey={tlKey} />
        </div>
      </div>

      {/* 워크플로우 Stepper */}
      <div className="card">
        <SectionTitle kicker="WORKFLOW" title="검수 / 발행 진행 상태" />
        <Stepper steps={data.WORKFLOW_STATES} current={detail.currentState} />
      </div>

      <div className="detail-grid">
        {/* A. 고객 도메인 관측값 */}
        <EvidenceCard
          title="A. 고객 도메인 관측값"
          accent="primary"
          badge={<span className="badge badge-soft badge-primary">외부 관측 기준</span>}
        >
          <div className="kv compact">
            <div><span>대상 URL</span><b><code className="inline-code">{obs.url}</code></b></div>
            <div><span>관측 시점</span><b>{obs.observedAt}</b></div>
            <div><span>HTTP Status</span><b>{obs.httpStatus}</b></div>
            <div><span>Console</span><b>{obs.console}</b></div>
          </div>
          <table className="hdr-table">
            <tbody>
              {obs.headers.map((h) => (
                <tr key={h.key}>
                  <td className="hdr-key">{h.key}</td>
                  <td className={`hdr-val flag-${h.flag}`}>{h.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <MockScreenshot label={obs.screenshotLabel} variant="plain" height={130} />
        </EvidenceCard>

        {/* B. 일반 조치 권고 */}
        <EvidenceCard
          title="B. 일반 조치 권고"
          accent="neutral"
          badge={<span className="badge badge-soft badge-neutral">보편 권고</span>}
        >
          <p className="guide-text">{guide.summary}</p>
          <div className="guide-checklist">
            <div className="mini-title">고객 내부 확인사항</div>
            <ul>
              {guide.checklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <NoticeBox tone="warning" title="주의">{guide.caution}</NoticeBox>
        </EvidenceCard>

        {/* C. 파트너 표준 검증랩 참고 증적 */}
        <EvidenceCard
          title="C. 파트너 검증랩 참고 증적 (조치 전·후 시연)"
          accent="purple"
          badge={<TagBadge tone="purple">참고용 PoC</TagBadge>}
        >
          <div className="btn-row" style={{ marginTop: 0, marginBottom: 12 }}>
            <button
              className="btn btn-secondary"
              onClick={() =>
                app.showToast('표준 검증랩 PoC 증적 생성 완료 — 고객 환경 검증은 SSC 재스캔이 필요합니다.')
              }
            >
              표준 검증랩 PoC 실행
            </button>
            <button className="btn btn-secondary" onClick={() => app.showToast('고객 도메인 외부 관측값 확인 (mock)')}>
              고객 도메인 외부 관측값 확인
            </button>
            <button className="btn btn-secondary" onClick={() => app.navigate('evidence')}>
              Evidence Pack 후보 생성
            </button>
          </div>
          <div className="ba-cards">
            <div className="ba-card before">
              <div className="ba-head">Before · 취약 상태</div>
              <code className="inline-code sm">{lab.before.url}</code>
              <ul className="ba-list">
                <li>HSTS: <b className="flag-danger">{lab.before.hsts}</b></li>
                <li>Web Render: {lab.before.render}</li>
                <li>Assets: {lab.before.assets}</li>
                <li>Console Error: {lab.before.consoleError}</li>
              </ul>
              <MockScreenshot label="Before card" variant="before" height={110} />
            </div>
            <div className="ba-card after">
              <div className="ba-head">After · 조치 후</div>
              <code className="inline-code sm">{lab.after.url}</code>
              <ul className="ba-list">
                <li>HSTS: <b className="flag-success">{lab.after.hsts}</b></li>
                <li>Web Render: {lab.after.render}</li>
                <li>Assets: {lab.after.assets}</li>
                <li>Console Error: {lab.after.consoleError}</li>
              </ul>
              <MockScreenshot label="After card" variant="after" height={110} />
            </div>
          </div>
          <div className="mini-title">Header / Status Diff</div>
          <BeforeAfterDiff rows={lab.diff} />
          <NoticeBox tone="warning" title="Not Customer Environment Validation">
            {data.PARTNER_LAB_NOTICE}
          </NoticeBox>
        </EvidenceCard>
      </div>

      <div className="rescan-callout">
        <span className="rescan-icon"><Icon name="rescan" size={16} /></span>
        <div>
          <div className="rescan-title">SecurityScorecard 재스캔 / 공식 검증 필요</div>
          <p>{data.RESCAN_NOTICE}</p>
        </div>
        <span className="badge badge-soft badge-orange">SSC 재스캔 필요</span>
      </div>

      <LegalFooter />
    </div>
  )
}

// ---------------------------------------------------------------------
// 6. Remediation Guides
// ---------------------------------------------------------------------
// 검증완료 오해 방지: 상태 문구 재매핑
function guideStateLabel(v) {
  return { Validated: 'Guide Reviewed', 'In Review': 'Reviewing', Draft: '초안' }[v] || v
}

// SSC 리스크 유형별 한글 단계별 조치 절차 (진단은 리스크 점검, 실행은 여기)
function IssueRemediationGuide({ issueType }) {
  const g = getRemediationGuide(issueType)
  const enginesApply = engineGuide(issueType).applies // 헤더/TLS 계열 → 엔진 탭으로 통일(검증랩과 동일)
  if (g.kind === 'none') {
    return <p className="guide-text">이 유형의 단계별 절차는 준비 중입니다. 리스크 점검 화면의 SSC 공식 조치 방법을 참고하세요.</p>
  }
  return (
    <div className="rem-guide">
      {g.kind === 'catalog' && (
        <>
          {g.why && (<><div className="mini-title">왜 문제인가</div><p className="guide-text">{g.why}</p></>)}
          {g.where?.length > 0 && (
            <>
              <div className="mini-title">조치 위치</div>
              <ul className="bullet">{g.where.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </>
          )}
          {!enginesApply && g.diff && (
            <>
              <div className="mini-title">설정 예시</div>
              <CodeBlock
                lang="nginx"
                label={g.diff.label || g.diff.file}
                filename={g.diff.file}
                code={g.diff.lines.filter((l) => l.t !== 'del').map((l) => l.s).join('\n')}
              >
                {g.diff.lines.map((l, i) => (
                  <div key={i} className={`dl dl-${l.t}`}>{l.t === 'add' ? '+ ' : l.t === 'del' ? '- ' : '  '}{l.s}</div>
                ))}
              </CodeBlock>
            </>
          )}
        </>
      )}
      {g.kind === 'steps' && (
        <>
          <div className="mini-title">조치 절차</div>
          <ol className="step-list">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {!enginesApply && g.example && (
            <>
              <div className="mini-title">예시</div>
              <CodeBlock lang={g.example.lang} label={g.example.lang} code={g.example.code} />
            </>
          )}
        </>
      )}
      {/* 조치 방법을 검증랩과 동일한 엔진 탭으로 통일(헤더/TLS 계열). dns/네트워크는 applies=false → null */}
      <EngineRemediation run={{ issueType }} />
      {g.verify?.length > 0 && (
        <>
          <div className="mini-title">검증 (예시)</div>
          <ul className="bullet">{g.verify.map((v, i) => <li key={i}><code className="inline-code sm">{v}</code></li>)}</ul>
        </>
      )}
      <NoticeBox tone="warning" title="고객 환경에 맞춰 조정하세요">
        위 설정·명령은 <b>일반적 구성 기준의 예시</b>입니다. 고객사 웹서버·프록시·CDN 구성에 따라 적용 방식이 다를 수 있으니, 운영 반영 전 <b>테스트</b>가 필요합니다.
      </NoticeBox>
      <NoticeBox tone="info">
        정확한 <b>조치 대상(영향 자산·증거)</b>은 리스크 점검 결과와 함께 전달하세요. 조치 후 <b>SSC 재스캔</b>으로 해소 여부를 확인합니다.
      </NoticeBox>
    </div>
  )
}

// 조치 가이드 단계형(개요 → 조치 방법 → 검증 → 마무리) — 검증랩 stepper(evi-* 클래스)와 동일 UX.
//  ★ 문장·헤딩·컴포넌트 일관성: catalogEntry 가 있으면 검증랩과 '같은 Sec* 섹션'을 합성 run 으로 재사용
//     (무엇이 왜 문제인가요 / 어디를 고쳐야 하나요 / 검증 명령 다크블록 / 일반 조치 방향·체크리스트).
//  ★ 가이드엔 실측 '관측값'이 없음 → '조치 전/후·관측값 비교' 단계는 제외(대신 3단계=검증 명령).
//  ★ catalogEntry 없는 3종(unsafe_sri·domain_missing_https 등)은 같은 헤딩으로 getRemediationGuide 폴백.
//  ※ 증적 팩 임베드는 평면 문서 유지(IssueRemediationGuide) — 여기 stepper는 가이드 드로어 전용.
export function GuideSteps({ detail, flat = false }) {
  const [step, setStep] = useState(0)
  const issueType = detail.key
  const entry = catalogEntry(issueType) || catalogEntry(canonicalIssueKey(issueType))
  const g = getRemediationGuide(issueType)
  const sevKo = entry ? (KO_SEVERITY[entry.severity] || entry.severity) : ''
  // 조치 방향(direction/steps)은 검증랩과 '같은 소스'(remediationGuides SSOT). 없으면 프론트 steps 폴백.
  const sharedGuide = LAB_GUIDES[labGuideKey(issueType)] || null
  const guideSteps = sharedGuide?.steps?.length ? sharedGuide.steps : (g.steps || [])
  // 조치 가이드는 실제 랩 실행이 아님 → 합성 run(치환용 플레이스홀더 대상). 검증랩 Sec* 재사용 목적.
  const guideRun = {
    issueType,
    accessUrl: 'https://<대상>',
    serviceEndpoint: '<대상>',
    sscLookupDomain: '<도메인>',
    domain: '<도메인>',
    guide: { direction: sharedGuide?.direction || '아래 절차대로 조치한 뒤 SecurityScorecard 재스캔으로 해소 여부를 확인합니다.', steps: guideSteps },
    note: '이 문서는 파트너 표준 조치 가이드 — 일반 구성 기준입니다. 고객 시스템을 실제로 바꾸거나 검증한 것이 아니며, 실제 해소 여부는 SecurityScorecard 재스캔으로 확인합니다.'
  }

  // 유형 메타(가이드 고유 — 검증랩 run kv 대응)
  const TypeMeta = (
    <>
      {/* 유형 식별자만(검증랩 run kv 대응) — 분류·위험도·난이도·영향은 아래 '무엇이 왜 문제인가요' 칩이 담당(중복 제거) */}
      <div className="mini-title">유형 메타</div>
      <div className="kv compact">
        <div><span>Issue Type</span><b>{detail.displayName}</b></div>
        <div><span>유형 키</span><b>{detail.key}</b></div>
      </div>
    </>
  )

  // 1) 개요 — 검증랩 SecOverview 재사용(무엇이 왜 문제인가요 + 컴플라이언스). 없으면 같은 헤딩 폴백.
  const Overview = (
    <>
      <InterpretationPanel issueKey={detail.key} why={entry?.why || g.why} />
      {TypeMeta}
      {entry
        ? <SecOverview run={guideRun} entry={entry} sevKo={sevKo} showKv={false} />
        : (<>
            {(g.why) && (<>
              <div className="mini-title">무엇이 왜 문제인가요</div>
              <div className="issue-summary">
                <div className="issue-summary-chips">
                  <span className="chip">항목: {detail.name}</span>
                  {detail.severity && <span className={`chip sev-${detail.severity}`}>위험도: {KO_SEVERITY[detail.severity] || detail.severity}</span>}
                  <span className="chip">분류: {detail.category}</span>
                  {detail.difficulty && <span className="chip">조치 난이도: {detail.difficulty}</span>}
                  {detail.impact && <span className="chip">서비스 영향: {detail.impact}</span>}
                </div>
                <p className="guide-text">{g.why}</p>
              </div>
            </>)}
            <ComplianceRef issueType={detail.key} category={detail.category} />
          </>)}
    </>
  )

  // 2) 조치 방법 — 검증랩 SecFix 재사용(어디를 고쳐야 하나요 + 설정 변경 예시 + 엔진 탭).
  const Fix = entry
    ? <SecFix run={guideRun} entry={entry} />
    : (<>
        {g.where?.length > 0 && (<>
          <div className="mini-title">어디를 고쳐야 하나요 (설정 위치)</div>
          <p className="hint-text">아래 위치 <b>중 한 곳</b>에서 적용하면 됩니다(환경에 맞는 곳 택1).</p>
          <ul className="bullet where-list">{g.where.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </>)}
        {g.kind === 'steps' && g.steps?.length > 0 && (<><div className="mini-title">조치 절차</div><ol className="step-list">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>)}
        {g.kind === 'catalog' && g.diff && (<>
          <div className="mini-title">설정 변경 예시</div>
          <CodeBlock lang="nginx" label={g.diff.label || g.diff.file} filename={g.diff.file} code={g.diff.lines.filter((l) => l.t !== 'del').map((l) => l.s).join('\n')}>
            {g.diff.lines.map((l, i) => (<div key={i} className={`dl dl-${l.t}`}>{l.t === 'add' ? '+ ' : l.t === 'del' ? '- ' : '  '}{l.s}</div>))}
          </CodeBlock>
        </>)}
        {g.kind === 'steps' && g.example && (<><div className="mini-title">예시</div><CodeBlock lang={g.example.lang} label={g.example.lang} code={g.example.code} /></>)}
        <EngineRemediation run={{ issueType }} />
      </>)

  // 3) 검증 — 검증랩 SecVerifyCommands 재사용(다크 검증 명령 블록). 없으면 g.verify 로 같은 블록 렌더.
  const Verify = (
    <>
      {entry?.verification?.length > 0
        ? <SecVerifyCommands run={guideRun} entry={entry} />
        : (g.verify?.length > 0
            ? (<>
                <div className="mini-title">조치 여부 확인 방법 (검증 명령)</div>
                <p className="hint-text">조치 후 아래 명령을 실행하면 정상 적용 여부를 직접 확인할 수 있습니다.</p>
                <pre className="verify-block">{g.verify.map((v, i) => (<div key={i} className="verify-line"><span className="verify-prompt">$</span> {v}</div>))}</pre>
              </>)
            : <p className="guide-text hint-text">이 유형의 자동 검증 명령 예시는 준비 중입니다. 조치 후 SSC 재스캔으로 해소 여부를 확인하세요.</p>)}
      <NoticeBox tone="info">
        정확한 <b>조치 대상(영향 자산·증거)</b>은 리스크 점검 결과 또는 <b>검증랩 재현</b>과 함께 전달하세요. 조치 후 <b>SSC 재스캔</b>으로 해소 여부를 확인합니다.
      </NoticeBox>
    </>
  )

  // 4) 마무리 — 검증랩 SecWrap 재사용(일반 조치 방향 + 고객 조치 체크리스트). 실행 로그는 가이드에 없음(includeLog=false).
  const Wrap = entry
    ? <SecWrap run={guideRun} entry={entry} includeLog={false} />
    : (<>
        <div className="mini-title">일반 조치 방향 (참고)</div>
        <p className="guide-text">{guideRun.guide.direction}</p>
        {guideSteps.length > 0 && <ul className="bullet">{guideSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>}
        <div className="mini-title">고객 조치 체크리스트</div>
        <ul className="action-checklist">
          {(g.where || ['조치 위치 확인']).map((w, i) => (<li key={i}><span className="cbx"><Icon name="square" size={13} /></span> {w}</li>))}
          <li><span className="cbx"><Icon name="square" size={13} /></span> 조치 후 재확인: {g.verify?.[0] || '검증 명령 실행'}</li>
          <li><span className="cbx"><Icon name="square" size={13} /></span> SecurityScorecard 재스캔으로 최종 해소 확인</li>
        </ul>
        <NoticeBox tone="warning" title="고객 환경 검증이 아닙니다">이 가이드는 <b>일반 구성 기준</b>입니다. 고객사 웹서버·프록시·CDN 구성에 따라 적용 방식이 다를 수 있으니 운영 반영 전 <b>테스트</b>가 필요합니다.</NoticeBox>
      </>)

  const steps = [
    { key: 'overview', title: '개요', node: Overview },
    { key: 'fix', title: '조치 방법', node: Fix },
    { key: 'verify', title: '검증', node: Verify },
    { key: 'wrap', title: '마무리', node: Wrap }
  ]
  const cur = Math.min(step, steps.length - 1)

  // flat: 스텝 대신 전 섹션을 세로로 나열(인쇄/상세 리포트용 — PDF에 전체 가이드 포함).
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
          <button key={s.key} type="button" className={`evi-step-chip ${i === cur ? 'active' : i < cur ? 'done' : ''}`} onClick={() => setStep(i)}>
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

// 조치 난이도 · 서비스 영향 배지 (낮음/중간/높음)
const LEVEL_TONE = { '낮음': 'success', '중간': 'warning', '높음': 'danger' }
function LevelBadge({ level }) {
  return <span className={`badge badge-soft badge-${LEVEL_TONE[level] || 'neutral'}`}>{level || '—'}</span>
}

// 조치 가이드 "해석"(쉬운말) — 공용 캐시(예열과 공유). why 없거나 실패 시 아무것도 안 그림(기술 why 폴백).
function InterpretationPanel({ issueKey, why }) {
  const [state, setState] = useState(() => {
    if (!why) return { status: 'skip', text: '' }
    const c = cachedInterpretation(issueKey)
    return c ? { status: 'ok', text: c } : { status: 'loading', text: '' }
  })
  useEffect(() => {
    if (!why) { setState({ status: 'skip', text: '' }); return }
    const c = cachedInterpretation(issueKey)
    if (c) { setState({ status: 'ok', text: c }); return }
    let alive = true
    setState({ status: 'loading', text: '' })
    loadInterpretation(issueKey).then((text) => {
      if (alive) setState(text ? { status: 'ok', text } : { status: 'skip', text: '' })
    })
    return () => { alive = false }
  }, [issueKey, why])
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

// 엔드포인트 목록(고객사·서비스 Endpoint·SSC 조회 기준·수집 상태) 공용 설정 — list-first 화면 통일(ENDPOINT_COLUMNS).
//  검증랩·조치 가이드·증적 팩이 동일한 컬럼/필터/렌더를 재사용 → 필드·문구 드리프트 방지.
function endpointListConfig(domains = []) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]
  const filterFields = [
    { key: 'customer', label: '고객사', type: 'select', options: uniq(domains.map((d) => d.customer)) },
    { key: 'status', label: '수집 상태', type: 'select', options: uniq(domains.map((d) => d.status)) },
    { key: 'serviceEndpoint', label: '서비스 Endpoint', type: 'text', get: domEndpoint },
    { key: 'sscLookupDomain', label: 'SSC 조회 기준', type: 'text', get: domLookup }
  ]
  const columns = [
    { key: 'customer', label: '고객사' },
    { key: 'serviceEndpoint', label: '서비스 Endpoint', get: domEndpoint },
    { key: 'sscLookupDomain', label: 'SSC 조회 기준', get: domLookup },
    { key: 'status', label: '수집 상태' }
  ]
  const renderCell = (key, row) => {
    if (key === 'serviceEndpoint') return <span><code className="inline-code">{domEndpoint(row)}</code>{row.port && <span className="badge badge-soft badge-purple new-tag">:{row.port}</span>}</span>
    if (key === 'sscLookupDomain') return <code className="inline-code sm">{domLookup(row)}</code>
    if (key === 'status') return <span className="status-cell"><StatusBadge status={row.status} />{row.riskCount != null && <span className="muted-cell"> · {row.riskCount}건</span>}</span>
    return row[key]
  }
  return { filterFields, columns, renderCell }
}

export function RemediationGuides({ app = null, focusIssueType = null }) {
  // 검증랩과 동일 구조: 첫 화면 = 고객사/엔드포인트 목록(페이지) → 행 클릭 → 우측 드로어(EndpointGuideDrawer).
  //  (전체 유형 카탈로그 참고는 랩 스튜디오 → 커버리지 '조치법'으로 이관됨)
  const domains = app?.domains || []
  const [target, setTarget] = useState(null)   // 선택 엔드포인트(도메인 행) → 우측 드로어
  const [detail, setDetail] = useState(null)   // 딥링크 전용 standalone 가이드 드로어
  const [efilters, setEfilters] = useState([])
  const [esearch, setEsearch] = useState('')
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]

  // 딥링크: focusIssueType → 대상 없이 해당 유형 가이드 드로어 오픈
  useEffect(() => {
    if (!focusIssueType) return
    const rep = String(focusIssueType).toLowerCase().replace(/_v\d+$/, '')
    const m = GUIDE_ISSUE_TYPES.map(guideRowMeta).find((g) => g.key === rep)
    if (m) setDetail(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIssueType])

  const epCfg = endpointListConfig(domains)
  const erows = applyFilters(domains, efilters, epCfg.filterFields, esearch, ['serviceEndpoint', 'sscLookupDomain', 'customer'])
  return (
    <div className="page">
      <PageHeader title="조치 가이드" desc="고객사·서비스 주소를 클릭하면 그 대상의 조치 가이드가 열립니다. 검증랩 미지원 유형만 다룹니다(지원 유형은 검증랩에서 증적과 함께 제공). 일반 조치 기준 · 고객 환경 반영 전 내부 검토 필요." />
      <FilterBar fields={epCfg.filterFields} filters={efilters} onChange={setEfilters} search={esearch} onSearchChange={setEsearch} searchPlaceholder="Endpoint · SSC 조회 기준 · 고객사 검색" resultCount={erows.length} />
      <div className="card no-pad">
        <DataTable columns={epCfg.columns} rows={erows} onRowClick={setTarget} renderCell={epCfg.renderCell} pageSize={10} />
      </div>
      <p className="hint-text">서비스 주소(행)를 클릭하면 우측 드로어에서 그 대상의 조치 가이드가 열립니다. 전체 유형 조치 참고는 <b>랩 스튜디오 → 커버리지</b>에서 확인합니다.</p>
      {target && <EndpointGuideDrawer row={target} app={app} onClose={() => setTarget(null)} />}
      {detail && (
        <Drawer
          title={detail.name}
          subtitle={`${detail.displayName} · ${detail.key}`}
          badges={<>{detail.severity && <SeverityBadge level={detail.severity} />}<span className="badge badge-soft badge-neutral">{detail.category}</span></>}
          onClose={() => setDetail(null)}
          footer={<SecondaryButton onClick={() => setDetail(null)}>닫기</SecondaryButton>}
          width="md"
        >
          <GuideSteps detail={detail} />
        </Drawer>
      )}
    </div>
  )
}

// 등록 Endpoint 클릭 → 우측 드로어에서 그 대상의 리스크 유형 조치 가이드 (검증랩 EndpointSandboxDrawer 와 동일 구조)
function EndpointGuideDrawer({ row, app, onClose }) {
  const serviceEndpoint = domEndpoint(row)
  const sscLookupDomain = domLookup(row)
  const accessUrl = row.accessUrl || row.baseUrl || (serviceEndpoint ? `https://${serviceEndpoint}` : '')
  const [scopeKeys, setScopeKeys] = useState(null)
  const [scopeStatus, setScopeStatus] = useState('loading') // loading|ok|empty|error
  const [detail, setDetail] = useState(null)
  const [filters, setFilters] = useState([])
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState([])

  // 대표 key 중복 제거(중복 React key 방지)
  const rowsAll = Object.values(GUIDE_ISSUE_TYPES.map(guideRowMeta).reduce((acc, r) => { if (!acc[r.key]) acc[r.key] = r; return acc }, {}))
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!sscLookupDomain) { setScopeStatus('idle'); return }
      setScopeStatus('loading'); setScopeKeys(null)
      try {
        const d = await collectRiskFindings(sscLookupDomain, { limit: 100, offset: 0, includeInfo: false })
        if (!alive) return
        const keys = new Set((d.findings || []).map((f) => canonicalIssueKey(f.issue_type)))
        setScopeKeys(keys); setScopeStatus(keys.size ? 'ok' : 'empty')
      } catch { if (alive) { setScopeKeys(null); setScopeStatus('error') } }
    })()
    return () => { alive = false }
  }, [sscLookupDomain])

  // 조치 가이드는 '검증랩 미지원' 이슈만 담당한다.
  //  검증랩이 지원하는 유형(catalogEntry 존재)은 검증랩에서 조치 전·후 증적 + 조치 방법을 함께 제공하므로
  //  여기에 중복 노출하지 않는다(역할 분리 — 사용자 혼란 방지).
  // 검증랩 지원 판별 — catalogEntry(canonical) 은 카탈로그 키의 _v2 유무가 섞여 오판(예: x_content_type)한다.
  //  → 카탈로그 키를 모두 canonical 화한 집합으로 비교(양쪽 정규화).
  const LAB_KEYS = new Set(catalogGroups().flatMap((g) => g.items.map((it) => canonicalIssueKey(it.key))))
  const isLabSupported = (k) => LAB_KEYS.has(canonicalIssueKey(k))
  const scopedRows = scopeKeys ? rowsAll.filter((g) => scopeKeys.has(canonicalIssueKey(g.key)) && !isLabSupported(g.key)) : []
  const labSupportedCount = scopeKeys ? [...scopeKeys].filter((k) => rowsAll.some((g) => canonicalIssueKey(g.key) === k) && isLabSupported(k)).length : 0
  const filterFields = [
    { key: 'category', label: '분류', type: 'select', options: uniq(rowsAll.map((g) => g.category)) },
    { key: 'severity', label: '위험도', type: 'select', options: uniq(rowsAll.map((g) => g.severity)) },
    { key: 'difficulty', label: '조치 난이도', type: 'select', options: uniq(rowsAll.map((g) => g.difficulty)) },
    { key: 'impact', label: '서비스 영향', type: 'select', options: uniq(rowsAll.map((g) => g.impact)) },
    { key: 'name', label: '리스크 항목', type: 'text' },
    { key: 'key', label: '유형 키', type: 'text' }
  ]
  const rows = applyFilters(scopedRows, filters, filterFields, search, ['name', 'displayName', 'key', 'category'])
  const columns = [
    { key: 'name', label: '리스크 항목' },
    { key: 'displayName', label: '이슈 유형' },
    { key: 'category', label: '분류' },
    { key: 'severity', label: '위험도' },
    { key: 'difficulty', label: '조치 난이도' },
    { key: 'impact', label: '서비스 영향' },
    { key: 'frameworks', label: '관련 프레임워크', get: (r) => frameworksForCategory(r.category).join(' ') }
  ]
  const renderCell = (key, r) => {
    if (key === 'name') return <strong>{r.name}</strong>
    if (key === 'displayName') return <span className="hint-text">{r.displayName}</span>
    if (key === 'severity') return r.severity ? <SeverityBadge level={r.severity} /> : <span className="hint-text">—</span>
    if (key === 'difficulty' || key === 'impact') return <LevelBadge level={r[key]} />
    if (key === 'frameworks') return <div className="fw-tags">{frameworksForCategory(r.category).map((f) => <span key={f} className="fw-tag">{f}</span>)}</div>
    return r[key]
  }
  return (
    <Drawer
      title={serviceEndpoint}
      subtitle={`고객사: ${row.customer} · 조치 가이드`}
      badges={<><StatusBadge status={row.status} />{scopeStatus === 'ok' && <span className="badge badge-soft badge-info">리스크 {scopeKeys.size}종</span>}</>}
      onClose={onClose}
      width="lg"
      footer={<SecondaryButton onClick={onClose}>닫기</SecondaryButton>}
    >
      <EndpointContext customer={row.customer} serviceEndpoint={serviceEndpoint} sscLookupDomain={sscLookupDomain} accessUrl={accessUrl} />
      <div className="mini-title" style={{ marginTop: 14 }}>이 대상의 조치 가이드</div>
      {scopeStatus === 'loading'
        ? <div className="card" style={{ padding: 28, textAlign: 'center' }}><span className="hint-text">이 대상의 SSC 리스크를 불러오는 중…</span></div>
        : scopeStatus === 'empty'
          ? <NoticeBox tone="info">이 대상은 아직 SSC 수집된 리스크가 없습니다. 전체 유형 조치는 <b>랩 스튜디오 → 커버리지</b>를 참고하세요.</NoticeBox>
          : scopeStatus === 'error'
            ? <NoticeBox tone="warning">리스크를 불러오지 못했습니다(조회 범위 밖일 수 있음).</NoticeBox>
            : scopedRows.length === 0
              ? <NoticeBox tone="info">이 대상의 수집 리스크는 모두 <b>검증랩에서 지원</b>됩니다{labSupportedCount ? ` (${labSupportedCount}종)` : ''}. 조치 전·후 증적과 조치 방법은 <b>검증랩 (참고 시연)</b>에서 확인하세요. (조치 가이드는 검증랩 미지원 유형만 다룹니다)</NoticeBox>
              : (
              <>
                {labSupportedCount > 0 && (
                  <p className="hint-text" style={{ margin: '0 0 10px' }}>검증랩 지원 {labSupportedCount}종은 <b>검증랩</b>에서 증적과 함께 제공되어 여기서 제외했습니다. 아래는 <b>검증랩 미지원</b> 유형입니다.</p>
                )}
                <FilterBar fields={filterFields} filters={filters} onChange={setFilters} search={search} onSearchChange={setSearch} searchPlaceholder="리스크 항목 · 이슈 유형 · 유형 키 검색" resultCount={rows.length} />
                <BulkActionsBar
                  count={sel.length}
                  onClear={() => setSel([])}
                  actions={app?.can?.('evidence') ? [{ label: '증적 팩(초안)에 추가', onClick: () => {
                    const picked = rows.filter((r) => sel.includes(r.key))
                    if (!picked.length) return
                    picked.forEach((r) => app?.addEvidencePack?.(packFromGuide(r, row)))
                    setSel([])
                    app?.showToast?.(`${picked.length}건 조치 권고 팩(초안)에 추가`)
                  } }] : []}
                />
                <div className="card no-pad">
                  <DataTable columns={columns} rows={rows} onRowClick={setDetail} renderCell={renderCell} selectable selected={sel} onSelectedChange={setSel} rowId={(r) => r.key} pageSize={10} />
                </div>
              </>
            )}
      {detail && (
        <Drawer
          title={detail.name}
          subtitle={`${detail.displayName} · ${detail.key}`}
          badges={<>{detail.severity && <SeverityBadge level={detail.severity} />}<span className="badge badge-soft badge-neutral">{detail.category}</span></>}
          onClose={() => setDetail(null)}
          footer={<SecondaryButton onClick={() => setDetail(null)}>닫기</SecondaryButton>}
          width="md"
        >
          <GuideSteps detail={detail} />
        </Drawer>
      )}
    </Drawer>
  )
}

// ---------------------------------------------------------------------
// 7. Validation Sandbox
// ---------------------------------------------------------------------
export function ValidationSandbox({ app, focus = null }) {
  // Domains와 동일한 목록 구성: 등록 Endpoint 행 → 클릭 시 드로어에서 PoC 실행·증적.
  const [target, setTarget] = useState(null)
  const [focusType, setFocusType] = useState(null) // 딥링크로 열 때 자동 선택할 issue_type
  const [filters, setFilters] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(data.sandboxRuns[0]) // dev mock 전용
  const [sel, setSel] = useState([]) // 일괄 선택된 id
  const domains = app.domains
  // 리스크 점검의 "검증랩 PoC" 딥링크 — 해당 endpoint 드로어 자동 오픈 + 리스크 자동 선택
  useEffect(() => {
    if (!focus) return
    const d = (app.domains || []).find((x) => domEndpoint(x) === focus.serviceEndpoint || domLookup(x) === focus.sscLookupDomain)
    if (d) { setTarget(d); setFocusType(focus.issueType || null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]
  const filterFields = [
    { key: 'customer', label: '고객사', type: 'select', options: uniq(domains.map((d) => d.customer)) },
    { key: 'status', label: '수집 상태', type: 'select', options: uniq(domains.map((d) => d.status)) },
    { key: 'serviceEndpoint', label: '서비스 Endpoint', type: 'text', get: domEndpoint },
    { key: 'sscLookupDomain', label: 'SSC 조회 기준', type: 'text', get: domLookup }
  ]
  const rows = applyFilters(domains, filters, filterFields, search, ['serviceEndpoint', 'sscLookupDomain', 'customer'])
  const columns = [
    { key: 'customer', label: '고객사' },
    { key: 'serviceEndpoint', label: '서비스 Endpoint', get: domEndpoint },
    { key: 'sscLookupDomain', label: 'SSC 조회 기준', get: domLookup },
    { key: 'status', label: '수집 상태' }
  ]
  const renderCell = (key, row) => {
    if (key === 'serviceEndpoint')
      return <span><code className="inline-code">{domEndpoint(row)}</code>{row.port && <span className="badge badge-soft badge-purple new-tag">:{row.port}</span>}</span>
    if (key === 'sscLookupDomain') return <code className="inline-code sm">{domLookup(row)}</code>
    if (key === 'status') return <StatusBadge status={row.status} />
    return row[key]
  }
  return (
    <div className="page">
      <PageHeader
        title="검증랩 (참고 시연)"
        desc="등록된 서비스 주소를 클릭하면 해당 주소의 리스크 항목을 검증랩에서 재현해 조치 전·후 참고 증적을 만듭니다."
      />
      <NoticeBox tone="warning" title="이 기능의 역할 (Not Customer Environment Validation)">
        Validation Sandbox는 고객 운영환경을 테스트하거나 조치 완료를 검증하는 기능이 아닙니다. 파트너 표준 검증랩에서
        일반 조치 방향을 PoC로 시연하고 참고 증적을 생성하는 내부 기능입니다.
      </NoticeBox>

      <FilterBar
        fields={filterFields}
        filters={filters}
        onChange={setFilters}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Endpoint · SSC 조회 기준 · 고객사 검색"
        resultCount={rows.length}
      />
      <BulkActionsBar
        count={sel.length}
        actions={[{ label: `CSV로 내보내기 (${sel.length})`, onClick: () => exportRowsToCsv(rows.filter((r) => sel.includes(r.id)), columns, 'validation-lab.csv') }]}
        onClear={() => setSel([])}
      />
      <div className="card no-pad">
        <DataTable columns={columns} rows={rows} onRowClick={(r) => { setTarget(r); setFocusType(null) }} renderCell={renderCell} selectable selected={sel} onSelectedChange={setSel} pageSize={10} />
      </div>
      <p className="hint-text">서비스 주소(행)를 클릭하면 검증랩 재현 실행·참고 증적이 열립니다.</p>
      {target && <EndpointSandboxDrawer row={target} app={app} focusIssueType={focusType} onClose={() => { setTarget(null); setFocusType(null) }} />}

      {/* Developer Mock Samples — VITE_ENABLE_DEV_MOCKS=true일 때만 노출 */}
      {ENABLE_DEV_MOCKS && (
        <>
          <div className="mini-title" style={{ marginTop: 24 }}>Developer Mock Samples</div>
          <NoticeBox tone="warning">
            이 영역은 UI 개발 및 테스트용 예시 데이터입니다. 실제 Partner Lab PoC 실행 결과가 아닙니다
            (<code className="inline-code sm">VITE_ENABLE_DEV_MOCKS=true</code>).
          </NoticeBox>
          <div className="card no-pad">
            <DataTable
              columns={[{ key: 'id', label: 'Run ID' }, { key: 'risk', label: '리스크 항목' }, { key: 'status', label: '실행 상태' }, { key: 'evidence', label: 'Evidence' }]}
              rows={data.sandboxRuns}
              onRowClick={setSelected}
              renderCell={(key, row) => key === 'id' ? <code className="inline-code">{row.id}</code> : (key === 'status' || key === 'evidence') ? <StatusBadge status={row[key]} /> : row[key]}
            />
          </div>

          <div className="sandbox-detail">
            <SectionTitle kicker={selected.id} title="실행 요약 및 증적" action={<StatusBadge status={selected.status} />} />
            <div className="run-meta">
              {data.sandboxRunMeta.map((m) => (
                <div key={m.label} className="run-meta-item">
                  <span className="run-meta-label">{m.label}</span>
                  <span className="run-meta-value">{m.value}</span>
                </div>
              ))}
            </div>
            <div className="split-2">
              <div className="card">
                <div className="mini-title">AI Browser Agent 실행 로그</div>
                <div className="terminal">
                  <div className="terminal-bar">
                    <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
                    <span className="terminal-title">sandbox · {selected.id} (read-only)</span>
                  </div>
                  <pre className="terminal-body">
{data.sandboxLog.map((l, i) => (
  <div key={i} className="term-line">{l}</div>
))}
                    <div className="term-cursor">▌</div>
                  </pre>
                </div>
                <div className="mini-title">Console / Network Summary</div>
                <div className="kv compact">
                  <div><span>Console</span><b>{data.sandboxDetail.consoleSummary}</b></div>
                  <div><span>Network</span><b>{data.sandboxDetail.networkSummary}</b></div>
                </div>
              </div>
              <div className="card">
                <div className="mini-title">Before / After Screenshot</div>
                <div className="ba-cards">
                  <MockScreenshot label="Before Screenshot" variant="before" height={130} />
                  <MockScreenshot label="After Screenshot" variant="after" height={130} />
                </div>
                <div className="mini-title">Header Diff</div>
                <BeforeAfterDiff rows={data.sandboxDetail.headerDiff} />
                <div className="btn-row">
                  <button className="btn btn-primary" disabled>Evidence Pack에 첨부</button>
                </div>
                <p className="hint-text">* 프로토타입 — 버튼은 동작하지 않습니다 (mock).</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// 등록 Endpoint 클릭 → 드로어에서 Partner Lab PoC 실행·증적 (해당 Endpoint 고정)
function EndpointSandboxDrawer({ row, app, onClose, focusIssueType = null }) {
  const serviceEndpoint = domEndpoint(row)
  const sscLookupDomain = domLookup(row)
  const accessUrl = row.accessUrl || row.baseUrl || (serviceEndpoint ? `https://${serviceEndpoint}` : '')
  const ep = { customer: row.customer, domainId: row.id, serviceEndpoint, sscLookupDomain, accessUrl, consent: row.consent, status: row.status }
  return (
    <Drawer
      title={serviceEndpoint}
      subtitle={`고객사: ${row.customer} · 검증랩 참고 시연`}
      badges={<><StatusBadge status={row.status} />{row.port && <span className="badge badge-soft badge-purple">:{row.port} 포트 보존</span>}<span className="badge badge-soft badge-purple">고객환경 검증 아님</span></>}
      onClose={onClose}
      width="lg"
      footer={<SecondaryButton onClick={onClose}>닫기</SecondaryButton>}
    >
      <ValidationSandboxRealPanel app={app} fixedEndpoint={ep} focusIssueType={focusIssueType} />
    </Drawer>
  )
}

// ---------------------------------------------------------------------
// 8. Evidence Packs
// ---------------------------------------------------------------------
// 등록 Endpoint 클릭 → 우측 드로어에서 그 고객사의 증적 팩(검증랩 lab + 조치 가이드 guide + 리스크 risk)
//  선택 → '전달에 포함'(발행) → 고객 전달 화면에 노출. (검수 단계 없음 — 전달 화면 미리보기가 최종 확인)
function EndpointPacksDrawer({ row, packs, app, onSelectPack, onClose }) {
  const [sel, setSel] = useState([])
  const serviceEndpoint = domEndpoint(row)
  const sscLookupDomain = domLookup(row)
  const accessUrl = row.accessUrl || row.baseUrl || (serviceEndpoint ? `https://${serviceEndpoint}` : '')
  // 고객사명 일치 OR 도메인 호스트 일치(customer 가 비어 '—'로 저장된 기존 팩도 표시 — CustomerView 와 동일 규칙)
  const custPacks = (packs || []).filter((p) =>
    p.customer === row.customer ||
    (sscLookupDomain && hostOfDom(p.sscLookupDomain || p.domain) === hostOfDom(sscLookupDomain))
  )
  const columns = [
    { key: 'title', label: '증적 팩 제목' },
    { key: 'riskCount', label: '리스크 수' },
    { key: 'created', label: '생성일' },
    { key: 'publish', label: '전달' }
  ]
  const renderCell = (key, p) => {
    if (key === 'title') return (
      <span>
        <strong>{p.title}</strong>
        {p.source === 'lab' && <span className="badge badge-soft badge-purple new-tag">검증랩 증적</span>}
        {p.source === 'risk' && <span className="badge badge-soft badge-primary new-tag">리스크 기반</span>}
        {p.source === 'guide' && <span className="badge badge-soft badge-neutral new-tag">조치 권고</span>}
      </span>
    )
    if (key === 'publish') return p.excluded === true
      ? <span className="badge badge-soft badge-neutral">전달 제외</span>
      : <span className="badge badge-soft badge-success">전달 포함</span>
    return p[key]
  }
  return (
    <Drawer
      title={serviceEndpoint}
      subtitle={`고객사: ${row.customer} · 증적 팩`}
      badges={<><StatusBadge status={row.status} /><span className="badge badge-soft badge-info">팩 {custPacks.length}건</span></>}
      onClose={onClose}
      width="lg"
      footer={<SecondaryButton onClick={onClose}>닫기</SecondaryButton>}
    >
      <EndpointContext customer={row.customer} serviceEndpoint={serviceEndpoint} sscLookupDomain={sscLookupDomain} accessUrl={accessUrl} />
      <div className="mini-title" style={{ marginTop: 14 }}>이 고객사의 증적 팩 ({custPacks.length})</div>
      {custPacks.length
        ? (<>
            <BulkActionsBar
              count={sel.length}
              onClear={() => setSel([])}
              actions={app?.can?.('evidence') ? [
                { label: '전달에서 제외', onClick: () => {
                  const picked = custPacks.filter((p) => sel.includes(p.id))
                  picked.forEach((p) => app?.updateEvidencePack?.(p.id, { excluded: true }))
                  setSel([])
                  app?.showToast?.(`${picked.length}건 전달에서 제외`)
                } },
                { label: '전달에 다시 포함', onClick: () => {
                  const picked = custPacks.filter((p) => sel.includes(p.id))
                  picked.forEach((p) => app?.updateEvidencePack?.(p.id, { excluded: false }))
                  setSel([])
                  app?.showToast?.(`${picked.length}건 고객 전달에 포함`)
                } },
                { label: '삭제', danger: true, onClick: () => {
                  const picked = custPacks.filter((p) => sel.includes(p.id))
                  if (!picked.length) return
                  if (!window.confirm(`선택한 증적 팩 ${picked.length}건을 삭제할까요? (되돌릴 수 없습니다)`)) return
                  picked.forEach((p) => app?.deleteEvidencePack?.(p.id))
                  setSel([])
                  app?.showToast?.({ tone: 'success', text: `${picked.length}건 삭제됨` })
                } }
              ] : []}
            />
            <div className="card no-pad"><DataTable columns={columns} rows={custPacks} onRowClick={onSelectPack} renderCell={renderCell} selectable selected={sel} onSelectedChange={setSel} rowId={(p) => p.id} pageSize={10} /></div>
            <p className="hint-text">증적 팩은 <b>기본으로 고객 전달에 포함</b>됩니다. 전달 화면 미리보기에서 확인 후 <b>전달에서 제외</b>하거나, 불필요한 팩은 <b>삭제</b>하세요. 팩 제목 클릭 시 상세.</p>
          </>)
        : <NoticeBox tone="info">아직 이 고객사의 증적 팩이 없습니다. <b>검증랩</b>·<b>조치 가이드</b>에서 '증적 팩(초안)에 추가'로 담으세요.</NoticeBox>}
    </Drawer>
  )
}

export function EvidencePacks({ app }) {
  const [target, setTarget] = useState(null)     // 선택 엔드포인트(우측 드로어)
  const [selected, setSelected] = useState(null) // 선택 팩(상세, 중첩 드로어)
  const [efilters, setEfilters] = useState([])
  const [esearch, setEsearch] = useState('')
  const domains = app?.domains || []

  // 백엔드(랩) 기반 팩 + mock 예시 결합. 손상 문자(U+FFFD) 정리 + lab 제목은 issueType로 재생성
  const bad = (s) => !s || String(s).includes('�')
  const cleanPack = (p) => ({
    ...p,
    title: p.source === 'lab' ? `${catalogNameKo(p.issueType)} — 파트너 검증랩 참고 증적` : p.title,
    customer: bad(p.customer) ? '—' : p.customer,
    domain: bad(p.domain) ? '—' : p.domain,
    customerViewed: bad(p.customerViewed) ? '미열람' : p.customerViewed
  })
  const allPacks = (app.evidencePacks || []).map(cleanPack) // 실데이터만(백엔드) — 목업 제거
  const epCfg = endpointListConfig(domains)
  const erows = applyFilters(domains, efilters, epCfg.filterFields, esearch, ['serviceEndpoint', 'sscLookupDomain', 'customer'])

  return (
    <div className="page">
      <PageHeader title="증적 팩" desc="고객사·서비스 주소를 클릭하면 우측에서 그 고객사의 증적 팩(검증랩 증적 + 조치 권고 + 리스크)이 열립니다." />
      <FilterBar fields={epCfg.filterFields} filters={efilters} onChange={setEfilters} search={esearch} onSearchChange={setEsearch} searchPlaceholder="Endpoint · SSC 조회 기준 · 고객사 검색" resultCount={erows.length} />
      <div className="card no-pad">
        <DataTable columns={epCfg.columns} rows={erows} onRowClick={setTarget} renderCell={epCfg.renderCell} pageSize={10} />
      </div>
      <p className="hint-text">서비스 주소(행)를 클릭하면 우측 드로어에서 그 고객사의 증적 팩이 열립니다.</p>
      {target && <EndpointPacksDrawer row={target} packs={allPacks} app={app} onSelectPack={setSelected} onClose={() => setTarget(null)} />}

      {selected && (
        <Drawer
          title={selected.title}
          subtitle={`${selected.id} · ${selected.customer} · ${selected.domain}`}
          badges={<>
            {selected.excluded === true
              ? <span className="badge badge-soft badge-neutral">전달 제외</span>
              : <span className="badge badge-soft badge-success">전달 포함</span>}
            <span className="badge badge-soft badge-neutral">리스크 {selected.riskCount}건</span>
            {selected.source === 'lab' && <TagBadge tone="purple">검증랩 증적</TagBadge>}
            {selected.source === 'guide' && <TagBadge tone="neutral">조치 권고</TagBadge>}
          </>}
          onClose={() => setSelected(null)}
          width="lg"
          footer={<>
            <button className="btn btn-ghost foot-left" onClick={() => window.print()}>PDF (인쇄/저장)</button>
            {app.can?.('evidence') && (selected.excluded === true
              ? <SecondaryButton onClick={() => { setSelected((s) => ({ ...s, excluded: false })); app.updateEvidencePack?.(selected.id, { excluded: false }); app.showToast?.('고객 전달에 포함됨') }}>전달에 포함</SecondaryButton>
              : <SecondaryButton onClick={() => { setSelected((s) => ({ ...s, excluded: true })); app.updateEvidencePack?.(selected.id, { excluded: true }); app.showToast?.('전달에서 제외됨') }}>전달에서 제외</SecondaryButton>)}
            {app.can?.('evidence') && selected.shareToken && <SecondaryButton onClick={() => { setSelected((s) => ({ ...s, shareToken: null, shareExpiresAt: null })); app.updateEvidencePack?.(selected.id, { shareToken: null, shareExpiresAt: null }); app.showToast?.('게시 링크 폐기됨 — 기존 링크는 더 이상 열리지 않습니다') }}>링크 폐기</SecondaryButton>}
            <SecondaryButton onClick={() => setSelected(null)}>닫기</SecondaryButton>
            {app.can?.('evidence') && <button className="btn btn-primary" onClick={() => { let t = selected.shareToken; if (!t) { const f = newShareFields(); t = f.shareToken; setSelected((s) => ({ ...s, ...f })); app.updateEvidencePack?.(selected.id, f) } navigator.clipboard?.writeText(`${location.origin}${location.pathname}#share=${t}`); app.showToast?.('고객 게시 링크 복사됨 — 30일간 유효, 로그인 없이 이 팩만 열림') }}>고객 링크 복사</button>}
          </>}
        >
          {selected.source === 'lab' ? <LabEvidencePackBody pack={selected} />
            : selected.source === 'risk' ? <RiskEvidencePackBody pack={selected} app={app} />
            : <EvidencePackBody pack={selected} app={app} />}
        </Drawer>
      )}
    </div>
  )
}

// 게시(공개) 뷰 — 사이드바 없는 고객 전달 전용 증적 화면 (#share=<token>)
// 무인증 공개 라우트(/api/public/shared/:token)만 호출 → 로그인 도입 후에도 열림
export function SharedPackView({ token }) {
  const [pack, setPack] = useState(undefined) // undefined=로딩, null=없음
  useEffect(() => {
    let alive = true
    fetchSharedPack(token)
      .then((p) => { if (alive) setPack(p || null) })
      .catch(() => { if (alive) setPack(null) })
    return () => { alive = false }
  }, [token])

  if (pack === undefined) return <div className="shared-pack"><div className="rf-skeleton">불러오는 중…</div></div>
  if (!pack) return <div className="shared-pack"><EmptyState title="증적을 찾을 수 없습니다" desc="링크가 만료되었거나 잘못된 주소입니다." /></div>

  return (
    <div className="shared-pack">
      <header className="shared-head">
        <div className="shared-brand"><span className="brand-logo">SS</span> SecurityScorecard 파트너 증적</div>
        <button className="btn btn-secondary" onClick={() => window.print()}>PDF 저장</button>
      </header>
      <div className="shared-body">
        <h1 className="shared-title">{pack.title}</h1>
        <p className="shared-sub">{pack.customer} · {pack.domain} · 발행일 {pack.created}</p>
        {pack.source === 'lab' ? <LabEvidencePackBody pack={pack} /> : <RiskEvidencePackBody pack={pack} />}
      </div>
    </div>
  )
}

// 관측 자산·증거 표 (증적 팩 공용)
function AssetEvidenceTable({ assets }) {
  if (!assets?.length) return <p className="hint-text">관측된 자산 정보가 없습니다.</p>
  return (
    <table className="data-table asset-table">
      <thead><tr><th>대상 (실제 URL)</th><th>관측 증거</th><th className="its-num">Last Seen</th></tr></thead>
      <tbody>
        {assets.map((a, i) => (
          <tr key={i}>
            <td>
              {a.asset_value ? <code className="inline-code sm">{a.asset_value}</code> : <span className="muted-cell">—</span>}
              {a.asset_value && a.own === false && <span className="badge badge-soft badge-warning asset-flag">타 도메인 · 소유 확인</span>}
            </td>
            <td>{a.evidence?.length ? <ul className="evidence-list">{a.evidence.map((e, j) => <li key={j}><code className="inline-code xs">{e}</code></li>)}</ul> : <span className="muted-cell">—</span>}</td>
            <td className="its-num">{a.last_seen || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// 증적 팩 공용 꼬리말 (E. 체크리스트 / F. 재스캔 / 법적 고지)
function EvidencePackTail() {
  return (
    <>
      <EvidenceCard title="고객 내부 검토 체크리스트" accent="neutral" badge={<TagBadge tone="neutral">고객 검토 필요</TagBadge>}>
        <ul className="check-list check-cols">
          {data.customerReviewChecklist.map((c) => <li key={c}><span className="check-box"><Icon name="square" size={13} /></span>{c}</li>)}
        </ul>
      </EvidenceCard>
      <EvidenceCard title="SecurityScorecard 재스캔 / 공식 검증 안내" accent="orange" badge={<TagBadge tone="orange">SSC 재스캔 필요</TagBadge>}>
        <NoticeBox tone="warning" title="공식 검증 필요">{data.RESCAN_NOTICE}</NoticeBox>
      </EvidenceCard>
      <LegalFooter />
    </>
  )
}

// 리스크 기반 증적 팩 본문 — 단일 유형 또는 도메인 종합(bundle)
function RiskEvidencePackBody({ pack }) {
  if (pack.bundle) return <RiskBundlePackBody pack={pack} />
  const r = pack.risk || {}
  const assets = pack.assets || []
  const gain = Number(r.score_impact ?? 0)
  return (
    <>
      <EvidenceCard title="A. SecurityScorecard 리스크 데이터" accent="primary" badge={<TagBadge tone="primary">SSC 리스크 데이터</TagBadge>}>
        <RegistrationSummaryCard
          rows={[
            { label: '문제(이슈 유형)', value: `${catalogNameKo(pack.issueType)} (${pack.issueType})` },
            { label: '리스크 영역(10대)', value: factorNameKo(r.factor) },
            { label: 'Severity', value: r.severity || '—' },
            { label: '조사 결과', value: `${r.count ?? assets.length}건` },
            { label: '점수 개선 여력', value: `+${gain.toFixed(1)}점 (SSC 점수 영향값 기준 예상치)` }
          ]}
        />
        {pack.ssc_description && (<><div className="mini-title">무엇이 문제인가</div><p className="guide-text">{pack.ssc_description}</p></>)}
      </EvidenceCard>

      <EvidenceCard title="컴플라이언스 관련성 (참고)" accent="warning" badge={<TagBadge tone="warning">관련성 참고</TagBadge>}>
        <DeliveryCompliance issueType={pack.issueType} category={catalogEntry(pack.issueType)?.category} industry={pack.industry} />
      </EvidenceCard>

      <EvidenceCard title="B. 관측된 자산 · 증거" accent="indigo" badge={<TagBadge tone="indigo">외부 관측 기준</TagBadge>}>
        <AssetEvidenceTable assets={assets} />
      </EvidenceCard>

      <EvidenceCard title="C. 검증" accent="purple" badge={<TagBadge tone="purple">{pack.sandboxSupported ? '검증랩 재현 가능' : '검증랩 미지원'}</TagBadge>}>
        {pack.sandboxSupported
          ? <NoticeBox tone="info">이 유형은 <b>파트너 검증랩에서 Before/After PoC 재현</b>이 가능합니다. 검증랩 실행 증적을 첨부해 전달하세요.</NoticeBox>
          : <NoticeBox tone="warning" title="검증랩 미지원 유형">이 유형은 파트너 검증랩 재현 대상이 아닙니다. 조치 후 <b>SSC 재스캔</b>으로 해소를 검증합니다.</NoticeBox>}
      </EvidenceCard>

      <EvidenceCard title="D. 조치 가이드 (보편 예시)" accent="warning" badge={<TagBadge tone="warning">조치 가이드</TagBadge>}>
        <IssueRemediationGuide issueType={pack.issueType} />
      </EvidenceCard>

      <EvidencePackTail />
    </>
  )
}

// 도메인 종합 증적 팩 본문 — 유형별 섹션 반복
function RiskBundlePackBody({ pack }) {
  const issues = [...(pack.issues || [])].sort((a, b) => (b.score_impact ?? 0) - (a.score_impact ?? 0))
  return (
    <>
      <EvidenceCard title="종합 요약" accent="primary" badge={<TagBadge tone="primary">도메인 종합</TagBadge>}>
        <RegistrationSummaryCard
          rows={[
            { label: '대상 도메인', value: pack.domain },
            { label: '현재 보안 점수', value: `${pack.score ?? '—'} / ${pack.grade ?? '—'}` },
            { label: '조치 시 개선 여력', value: `+${Number(pack.totalGain || 0).toFixed(1)}점 (예상치)` },
            { label: '포함 유형', value: `${issues.length}종` }
          ]}
        />
      </EvidenceCard>
      {issues.map((iss, i) => (
        <EvidenceCard
          key={i}
          title={`${i + 1}. ${catalogNameKo(iss.issue_type)}`}
          accent={iss.sandboxSupported ? 'purple' : 'warning'}
          badge={<TagBadge tone={iss.sandboxSupported ? 'purple' : 'neutral'}>{iss.sandboxSupported ? '검증랩 지원' : '검증랩 미지원'}</TagBadge>}
        >
          <div className="kv compact">
            <div><span>리스크 영역</span><b>{factorNameKo(iss.factor)}</b></div>
            <div><span>Severity</span><b>{iss.severity || '—'}</b></div>
            <div><span>점수 개선 여력</span><b className="gain-num">+{Number(iss.score_impact ?? 0).toFixed(1)}점</b></div>
            <div><span>조사 결과</span><b>{iss.count ?? iss.assets?.length ?? 0}건</b></div>
          </div>
          {iss.ssc_description && (<><div className="mini-title">무엇이 문제인가</div><p className="guide-text">{iss.ssc_description}</p></>)}
          <div className="mini-title">관측 자산 · 증거</div>
          <AssetEvidenceTable assets={iss.assets} />
          <div className="mini-title">조치 가이드 (보편 예시)</div>
          <IssueRemediationGuide issueType={iss.issue_type} />
        </EvidenceCard>
      ))}
      <EvidencePackTail />
    </>
  )
}

function EvidencePackBody({ pack, app }) {
  const detail = data.findingDetails['RF-1001']
  const obs = detail.observation
  const f = data.evidenceSscFinding
  return (
    <>
      <EvidenceCard title="생성 근거" accent="success" badge={<TagBadge tone="success">생성 근거</TagBadge>}>
        <ProgressTimeline items={data.evidenceBasis} compact />
      </EvidenceCard>

      {/* A. SecurityScorecard 리스크 데이터 */}
      <EvidenceCard title="A. SecurityScorecard 리스크 데이터" accent="primary" badge={<TagBadge tone="primary">SSC 리스크 데이터</TagBadge>}>
        <RegistrationSummaryCard
          rows={[
            { label: 'Source', value: f.source },
            { label: 'Finding / Issue Type', value: f.issueType },
            { label: 'Factor', value: f.factor },
            { label: 'Severity', value: f.severity },
            { label: 'Imported At', value: f.importedAt },
            { label: 'Score Impact', value: f.scoreImpact },
            { label: 'First Seen / Last Seen', value: `${f.firstSeen} / ${f.lastSeen}` },
            { label: 'SecurityScorecard Platform Link', value: f.platformLink }
          ]}
        />
      </EvidenceCard>

      {/* B. 고객 도메인 외부 관측값 */}
      <EvidenceCard title="B. 고객 도메인 외부 관측값" accent="indigo" badge={<TagBadge tone="indigo">외부 관측 기준</TagBadge>}>
        <div className="split-2">
          <div>
            <div className="kv compact">
              <div><span>대상 URL</span><b><code className="inline-code">{obs.url}</code></b></div>
              <div><span>관측 시점</span><b>{obs.observedAt}</b></div>
              <div><span>HTTP Status</span><b>{obs.httpStatus}</b></div>
              <div><span>Console</span><b>{obs.console}</b></div>
            </div>
            <table className="hdr-table">
              <tbody>
                {obs.headers.map((h) => (
                  <tr key={h.key}>
                    <td className="hdr-key">{h.key}</td>
                    <td className={`hdr-val flag-${h.flag}`}>{h.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MockScreenshot label={obs.screenshotLabel} variant="plain" height={180} />
        </div>
      </EvidenceCard>

      {/* C. 파트너 표준 검증랩 참고 증적 */}
      <EvidenceCard title="C. 파트너 표준 검증랩 참고 증적" accent="purple" badge={<TagBadge tone="purple">참고용 PoC</TagBadge>}>
        <div className="kv compact">
          <div><span>Lab Case</span><b>SEC-LAB / HSTS</b></div>
          <div><span>Before URL</span><b><code className="inline-code sm">{detail.lab.before.url}</code></b></div>
          <div><span>After URL</span><b><code className="inline-code sm">{detail.lab.after.url}</code></b></div>
          <div><span>Before 관측값</span><b className="flag-danger">HSTS {detail.lab.before.hsts}</b></div>
          <div><span>After 관측값</span><b className="flag-success">HSTS {detail.lab.after.hsts}</b></div>
        </div>
        <div className="ba-cards">
          <MockScreenshot label="Before" variant="before" height={130} />
          <MockScreenshot label="After" variant="after" height={130} />
        </div>
        <div className="mini-title">Header Diff</div>
        <BeforeAfterDiff rows={detail.lab.diff} />
        <NoticeBox tone="warning">
          이 증적은 고객사 운영환경이 아닌 <b>파트너 표준 검증랩에서 생성된 참고용 PoC 증적</b>입니다.
        </NoticeBox>
      </EvidenceCard>

      {/* D. 일반 조치 권고 */}
      <EvidenceCard title="D. 일반 조치 권고" accent="warning" badge={<TagBadge tone="warning">일반 권고</TagBadge>}>
        <p className="guide-text">{detail.guide.summary}</p>
        <div className="split-2">
          <div>
            <div className="mini-title">조치 전 확인사항</div>
            <ul className="bullet">
              {detail.guide.checklist.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          <div>
            <div className="mini-title">참고</div>
            <div className="kv compact">
              <div><span>서비스 영향 가능성</span><b>중간 (구성에 따라 상이)</b></div>
              <div><span>관련 담당 부서</span><b>보안팀 · 웹서비스 운영팀</b></div>
            </div>
          </div>
        </div>
      </EvidenceCard>

      {/* E. 고객 내부 검토 체크리스트 */}
      <EvidenceCard title="E. 고객 내부 검토 체크리스트" accent="neutral" badge={<TagBadge tone="neutral">고객 검토 필요</TagBadge>}>
        <ul className="check-list check-cols">
          {data.customerReviewChecklist.map((c) => (
            <li key={c}><span className="check-box"><Icon name="square" size={13} /></span>{c}</li>
          ))}
        </ul>
      </EvidenceCard>

      {/* F. SecurityScorecard 재스캔 / 공식 검증 안내 */}
      <EvidenceCard title="F. SecurityScorecard 재스캔 / 공식 검증 안내" accent="orange" badge={<TagBadge tone="orange">SSC 재스캔 필요</TagBadge>}>
        <NoticeBox tone="warning" title="공식 검증 필요">{data.RESCAN_NOTICE}</NoticeBox>
        <div className="btn-row">
          {data.rescanActions.map((a) => (
            <button key={a.key} className="btn btn-secondary" onClick={() => app?.showToast?.(`${a.label} (mock)`)}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
        <p className="hint-text">* 실제 SecurityScorecard API 호출 없이 mock 동작입니다.</p>
      </EvidenceCard>

      <LegalFooter />
    </>
  )
}

// 랩 실행에서 첨부된 Evidence Pack 상세 — C영역에 실제 랩 증적 렌더 (드로어 본문)
function LabEvidencePackBody({ pack }) {
  const [run, setRun] = useState(null)
  const [status, setStatus] = useState('loading') // loading|ok|error
  useEffect(() => {
    let alive = true
    getLabRun(pack.labRunId)
      .then((r) => { if (alive) { setRun(r); setStatus('ok') } })
      .catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [pack.labRunId])

  return (
    <>
      <EvidenceCard title="생성 근거" accent="success" badge={<TagBadge tone="success">생성 근거</TagBadge>}>
        <ProgressTimeline
          items={['SSC Finding(issue_type) 식별', '파트너 표준 검증랩 PoC 실행', 'Before/After 참고 증적 수집', 'Evidence Pack 첨부', '고객 전달 준비']}
          compact
        />
      </EvidenceCard>

      <EvidenceCard title="A. SecurityScorecard 리스크 데이터" accent="primary" badge={<TagBadge tone="primary">SSC 리스크 데이터</TagBadge>}>
        <RegistrationSummaryCard
          rows={[
            { label: 'Issue Type', value: pack.issueType },
            { label: 'Category', value: pack.category },
            { label: '대상 도메인', value: pack.domain }
          ]}
        />
        <p className="hint-text">* 실 연동 시 SSC factor/severity/first·last seen을 이 영역에 매핑합니다.</p>
      </EvidenceCard>

      <EvidenceCard title="C. 파트너 표준 검증랩 참고 증적 (실제 캡처)" accent="purple" badge={<TagBadge tone="purple">참고용 PoC</TagBadge>}>
        {status === 'loading' && <div className="rf-skeleton">랩 증적 불러오는 중…</div>}
        {status === 'error' && <NoticeBox tone="danger" title="증적 로드 실패">랩 실행 기록을 불러올 수 없습니다(Backend/랩 상태 확인).</NoticeBox>}
        {status === 'ok' && <LabEvidenceView run={run} />}
      </EvidenceCard>

      <EvidenceCard title="F. SecurityScorecard 재스캔 / 공식 검증 안내" accent="orange" badge={<TagBadge tone="orange">SSC 재스캔 필요</TagBadge>}>
        <NoticeBox tone="warning" title="공식 검증 필요">{data.RESCAN_NOTICE}</NoticeBox>
      </EvidenceCard>

      <LegalFooter />
    </>
  )
}

// 고객 전달 드릴인용 — 검증랩과 동일한 5단계 증적 스테퍼(개요→조치 방법→조치 전/후→관측값·확인→마무리).
// 팩의 labRunId로 실제 랩 런을 불러와 before/after 캡처를 그대로 노출한다.
function LabEvidenceStepsBody({ pack, flat = false }) {
  const [run, setRun] = useState(null)
  const [status, setStatus] = useState('loading') // loading|ok|error
  useEffect(() => {
    let alive = true
    getLabRun(pack.labRunId)
      .then((r) => { if (alive) { setRun(r); setStatus('ok') } })
      .catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [pack.labRunId])
  return (
    <>
      <NoticeBox tone="info">
        파트너 검증랩에서 <b>같은 문제를 재현</b>해 <b>조치 전 → 조치 후</b>를 비교로 보여주는 참고 증적입니다.
        고객 시스템을 실제로 바꾸거나 검증한 것은 아니며, 실제 해소 여부는 <b>SecurityScorecard 재스캔</b>으로 확인합니다.
      </NoticeBox>
      {status === 'loading' && <div className="rf-skeleton">랩 증적 불러오는 중…</div>}
      {status === 'error' && <NoticeBox tone="danger" title="증적 로드 실패">랩 실행 기록을 불러올 수 없습니다(Backend/랩 상태 확인).</NoticeBox>}
      {status === 'ok' && <LabEvidenceSteps run={run} flat={flat} />}
    </>
  )
}

// ---------------------------------------------------------------------
// 10. Customer Delivery — 전달 대상 리스트 + 새창 리포트 뷰어(2스텝)
// ---------------------------------------------------------------------
const hostOfDom = (s) => String(s || '').replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase()

// 리스트 행의 보안등급 — sscScore.js 공유 캐시 재사용(도메인당 세션 1회, 화면 간 공용). 중복 호출 없음.
function DeliveryScoreCell({ domain }) {
  const s = useScore(domain)
  if (s === undefined) return <span className="hint-text">…</span>
  if (!s || s.grade == null) return <span className="hint-text">—</span>
  return <ScoreBadge score={s.score} grade={s.grade} />
}

// 고객 전달 화면 = 전달 대상(고객사) 리스트. 행 클릭 → 새 창에 리포트 뷰어.
export function CustomerView({ app }) {
  const customers = app?.customers || []
  const domains = app?.domains || []
  const packs = app?.evidencePacks || []
  const [q, setQ] = useState('')

  const rows = customers.map((c) => {
    const dom = domains.find((d) => d.customer === c.name)
    const shownDomain = dom ? (dom.serviceEndpoint || dom.primary) : null
    const scoreDomain = dom ? (dom.sscLookupDomain || (dom.serviceEndpoint || dom.primary || '').split(':')[0]) : null
    const custPacks = packs.filter((p) => p.excluded !== true && (p.customer === c.name || (scoreDomain && hostOfDom(p.sscLookupDomain || p.domain) === hostOfDom(scoreDomain))))
    const labN = custPacks.filter((p) => p.source === 'lab').length
    const viewed = custPacks.some((p) => p.customerViewed === '열람')
    return { id: c.id, name: c.name, shownDomain, scoreDomain, labN, status: viewed ? '열람' : (custPacks.length ? '준비됨' : '—') }
  }).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.shownDomain || '').toLowerCase().includes(q.toLowerCase()))

  const openReport = (name) => window.open(`${location.origin}${location.pathname}#report=${encodeURIComponent(name)}`, '_blank', 'noopener')

  return (
    <div className="page">
      <PageHeader title="고객 전달" desc="전달 대상 고객사 목록 — 고객사를 클릭하면 새 창에 리포트 뷰어가 열립니다(리포트 검토 → 전달)." />
      <div className="card picker-card" style={{ marginBottom: 12 }}>
        <label className="field" style={{ maxWidth: 320 }}>
          <span className="field-label">검색</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="고객사 · 도메인 검색" />
        </label>
        <p className="hint-text">보안등급은 다른 화면에서 조회한 값을 재사용합니다(중복 호출 없음). 조치 전후 증거 = 발행된 검증랩 증적 팩 수.</p>
      </div>
      {rows.length ? (
        <div className="card no-pad">
          <table className="data-table">
            <thead><tr><th>고객사</th><th>대상 도메인</th><th>보안등급</th><th>조치 전후 증거</th><th>전달 상태</th><th>리포트</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => openReport(r.name)}>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.shownDomain ? <code className="inline-code sm">{r.shownDomain}</code> : <span className="hint-text">도메인 미등록</span>}</td>
                  <td>{r.scoreDomain ? <DeliveryScoreCell domain={r.scoreDomain} /> : <span className="hint-text">—</span>}</td>
                  <td>{r.labN ? <span className="badge badge-soft badge-purple">{r.labN}건</span> : <span className="hint-text">0건</span>}</td>
                  <td><span className={`badge badge-soft ${r.status === '열람' ? 'badge-success' : r.status === '준비됨' ? 'badge-primary' : 'badge-neutral'}`}>{r.status}</span></td>
                  <td onClick={(e) => e.stopPropagation()}><button className="btn btn-mini" onClick={() => openReport(r.name)}>새 창으로 열기 ↗</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="전달 대상이 없습니다" desc="고객사·도메인을 먼저 등록하세요." />}
    </div>
  )
}

// 새창 리포트 뷰어 — 사이드바 없는 문서 리더 + 2스텝(리포트 검토 → 전달). #report=<고객사>로 진입(인증 필요).
export function DeliveryReportViewer({ custName, app }) {
  const customers = app?.customers || []
  const custDomain = (app?.domains || []).find((d) => d.customer === custName)
  const shownDomain = custDomain ? (custDomain.serviceEndpoint || custDomain.primary) : '—'
  const scoreDomain = custDomain ? (custDomain.sscLookupDomain || (custDomain.serviceEndpoint || custDomain.primary || '').split(':')[0]) : null
  const cvScore = useScore(scoreDomain)
  const [typeSummary, setTypeSummary] = useState([])
  const [drillIssue, setDrillIssue] = useState(null)
  const [step, setStep] = useState(0) // 0=리포트 검토, 1=전달
  const labPacks = (app?.evidencePacks || []).filter((p) => p.source === 'lab' && p.excluded !== true
    && (hostOfDom(p.sscLookupDomain || p.domain) === hostOfDom(scoreDomain) || p.customer === custName))
  const today = new Date().toISOString().slice(0, 10)
  // 전달 시점 재촬영은 제거됨 — 정적 랩 타깃 재촬영은 그림이 동일해 무의미.
  //  대표 증적은 검증랩 화면에서 지정하며, 여기서는 팩이 가리키는 대표 런을 그대로 사용한다.

  useEffect(() => {
    let alive = true
    if (!scoreDomain) { setTypeSummary([]); return }
    // 이미 조회한 요약을 재사용(창 간 localStorage 캐시) — 새 창에서도 재호출 없이 즉시.
    getIssueTypeSummary(scoreDomain)
      .then((s) => { if (alive) setTypeSummary(s || []) })
      .catch(() => { if (alive) setTypeSummary([]) })
    return () => { alive = false }
  }, [scoreDomain])

  const drillLabPack = drillIssue && labPacks.find((p) => canonicalIssueKey(p.issueType) === canonicalIssueKey(drillIssue.issue_type))
  const drillMeta = drillIssue && guideRowMeta(drillIssue.issue_type)
  const hasLabEvidence = (issueType) => labPacks.some((p) => canonicalIssueKey(p.issueType) === canonicalIssueKey(issueType))
  const deliveryCol = { header: '전달 형태', render: (r) => hasLabEvidence(r.issue_type) ? <span className="badge badge-soft badge-purple">조치 전후 증거</span> : <span className="badge badge-soft badge-neutral">조치 가이드</span> }
  const custObj = customers.find((c) => c.name === custName)
  const contactEmail = custObj?.contact && /@/.test(custObj.contact) ? custObj.contact.trim() : ''
  const evidenceN = labPacks.length
  const buildMailto = () => {
    const subject = `[SecurityScorecard 보안 리포트] ${custName} · ${today}`
    const body = [
      `${custName} 담당자님,`, '',
      'SecurityScorecard 기반 보안 리스크 리포트를 전달드립니다.',
      `· 대상 도메인: ${shownDomain || '—'}`,
      `· 보안 등급: ${cvScore?.grade ?? '—'} (${cvScore?.score ?? '—'}점)`,
      `· 조치 우선순위 항목: ${typeSummary.length}건`, '',
      '상세 내용은 첨부된 PDF 리포트를 확인해 주세요. (본 화면의 "PDF (인쇄/저장)"으로 저장한 파일을 첨부해 발송하세요.)', '',
      '※ 파트너 검증랩 증적은 조치 완료를 의미하지 않으며, 실제 Finding 해소 여부는 SecurityScorecard 재스캔 또는 공식 검증 절차로 확인해야 합니다.', '',
      '감사합니다.'
    ].join('\n')
    return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  if (!custObj && !custDomain) {
    return <div className="report-window"><div className="report-doc"><EmptyState title="대상을 찾을 수 없습니다" desc={`'${custName}' 고객사/도메인이 없습니다. 전달 목록에서 다시 여세요.`} /></div></div>
  }

  const steps = ['리포트 검토', '전달']

  return (
    <div className="report-window">
      <div className="report-doc customer-view">
        <div className="cv-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 16, color: '#fff', flexShrink: 0 }}>SS</div>
            <div>
              <div className="cv-kicker">SSC 파트너 · 보안 리스크 리포트</div>
              <h1>{custName}</h1>
              <p>대상 도메인 <code className="inline-code">{shownDomain}</code> · 발행일 {today}</p>
            </div>
          </div>
          <div className="cv-banner-right">
            <div className="cv-score">
              <span className="cv-score-label">SecurityScorecard 보안등급</span>
              <ScoreBadge score={cvScore?.score} grade={cvScore?.grade} loading={cvScore === undefined} />
            </div>
          </div>
        </div>

        <div className="report-steps cv-noprint">
          {steps.map((s, i) => (
            <button key={s} type="button" className={`report-step-chip ${i === step ? 'active' : i < step ? 'done' : ''}`} onClick={() => setStep(i)}>
              <span className="report-step-no">{i + 1}</span>{s}
            </button>
          ))}
        </div>

        <div className={`report-step report-step-review ${step === 0 ? 'active' : ''}`}>
          <NoticeBox tone="warning" title="증적 성격 안내">
            파트너 표준 검증랩 증적은 귀사 운영환경의 조치 완료를 의미하지 않습니다. 실제 Finding 해소 여부는
            SecurityScorecard 재스캔 또는 공식 검증 절차를 통해 확인해야 합니다.
          </NoticeBox>
          {typeSummary.length > 0
            ? <IssueTypeSummary rows={typeSummary} includeInfo={false} score={cvScore?.score} grade={cvScore?.grade} onSelectType={setDrillIssue} lastCol={deliveryCol} />
            : <EmptyState title="표시할 리스크가 없습니다" desc={`${custName}(${shownDomain || '—'})에 대해 수집된 SecurityScorecard 리스크가 없습니다.`} />}
        </div>

        <div className={`report-step report-step-deliver ${step === 1 ? 'active' : ''}`}>
          <div className="card" style={{ marginBottom: 12 }}>
            <SectionTitle title="전달 요약" desc="아래 방법으로 고객에게 리포트를 전달합니다." />
            <div className="kv compact">
              <div><span>고객사</span><b>{custName}</b></div>
              <div><span>대상 도메인</span><b>{shownDomain}</b></div>
              <div><span>보안등급</span><b>{cvScore?.grade ?? '—'} ({cvScore?.score ?? '—'})</b></div>
              <div><span>조치 우선순위</span><b>{typeSummary.length}건</b></div>
              <div><span>조치 전후 증거</span><b>{evidenceN}건</b></div>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <SectionTitle title="전달 방법" />
            <div className="report-deliver-actions">
              <button className="btn btn-secondary" onClick={() => window.print()}>PDF (인쇄/저장)</button>
              <a className="btn btn-primary" href={buildMailto()} style={{ textDecoration: 'none' }} title={contactEmail ? `받는사람: ${contactEmail}` : '받는사람 직접 입력'}>이메일로 전달</a>
            </div>
            <p className="hint-text">① <b>PDF (인쇄/저장)</b>으로 리포트를 저장 → ② <b>이메일로 전달</b>로 파트너 메일이 열리면(수신자·제목·본문 프리필) 저장한 PDF를 첨부해 발송하세요. 앱이 직접 발송하지 않습니다.</p>
          </div>
          <NoticeBox tone="info" title="게시 링크(개별 팩)">개별 증적 팩의 고객 게시 링크는 <b>증적 팩</b> 화면에서 발급합니다(로그인 없이 해당 팩만 열람).</NoticeBox>
        </div>

        <div className="report-nav cv-noprint">
          <SecondaryButton onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← 이전</SecondaryButton>
          <span className="report-nav-count">{step + 1} / {steps.length} · {steps[step]}</span>
          {step < steps.length - 1
            ? <PrimaryButton onClick={() => setStep((s) => s + 1)}>다음 →</PrimaryButton>
            : <button className="btn btn-ghost" onClick={() => window.close()}>창 닫기</button>}
        </div>

        {/* 인쇄 전용 — PDF에 이슈별 상세 조치 가이드 전체 포함(화면엔 숨김, @media print에서만 노출). */}
        {typeSummary.length > 0 && (
          <div className="report-print-detail">
            {[...typeSummary]
              .filter((r) => String(r.severity || '').toLowerCase() !== 'info')
              .sort((a, b) => (b.score_impact ?? 0) - (a.score_impact ?? 0))
              .map((t, i) => {
                // 우선순위 표와 동일 순서(순번)·동일 분기: 검증랩 재현 증적이 있으면 조치 전/후 스텝, 없으면 조치 가이드.
                const lp = labPacks.find((p) => canonicalIssueKey(p.issueType) === canonicalIssueKey(t.issue_type))
                return (
                  <div key={t.issue_type} className="report-print-issue">
                    <h3 className="report-print-issue-h">{i + 1}. {catalogNameKo(t.issue_type)} <span className="report-print-issue-key">{t.issue_type}</span></h3>
                    {lp ? <LabEvidenceStepsBody pack={lp} flat /> : <GuideSteps detail={guideRowMeta(t.issue_type)} flat />}
                  </div>
                )
              })}
          </div>
        )}

        <LegalFooter />
      </div>

      {drillIssue && (
        <Drawer
          title={catalogNameKo(drillIssue.issue_type)}
          subtitle={`${custName} · ${shownDomain}`}
          badges={<>{drillIssue.severity && <SeverityBadge level={drillIssue.severity} />}{drillLabPack ? <TagBadge tone="purple">검증랩 증적</TagBadge> : <TagBadge tone="neutral">조치 가이드</TagBadge>}</>}
          onClose={() => setDrillIssue(null)}
          width="lg"
          footer={<SecondaryButton onClick={() => setDrillIssue(null)}>닫기</SecondaryButton>}
        >
          {drillLabPack ? <LabEvidenceStepsBody pack={drillLabPack} /> : <GuideSteps detail={drillMeta} />}
        </Drawer>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// 11. Audit Log
// ---------------------------------------------------------------------
// SSC API 토큰 카드 (조직 공용 · 관리자 전용) — 값 미노출(write-only), 서버 암호화 저장
function SscTokenCard() {
  const [st, setSt] = useState(null)
  const [tok, setTok] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useEffect(() => { sscTokenStatus().then(setSt).catch(() => setSt({ configured: false, source: 'none' })) }, [])
  const save = async () => {
    if (!tok.trim()) return
    setBusy(true); setMsg(null)
    try { const s = await sscTokenSet(tok.trim()); setSt(s); setTok(''); setMsg('저장됨 — 서버에 암호화 저장, 파트너가 자동 사용') }
    catch (e) { setMsg(e?.payload?.message || '저장 실패') }
    finally { setBusy(false) }
  }
  const clear = async () => {
    setBusy(true); setMsg(null)
    try { const s = await sscTokenClear(); setSt(s); setMsg('삭제됨 — env 값으로 폴백') }
    catch { setMsg('삭제 실패') }
    finally { setBusy(false) }
  }
  return (
    <div className="ssc-token-card">
      <div className="mini-title">SSC API 토큰 <span className="hint-text">조직 공용 · 관리자 전용</span></div>
      <div className="stc-status">
        {st?.configured
          ? <span className="badge badge-soft badge-success">● 설정됨 {st.hint} <span className="hint-text">· {st.source === 'db' ? '관리자 설정' : 'env'}</span></span>
          : <span className="badge badge-soft badge-neutral">○ 미설정</span>}
      </div>
      <label className="field">
        <span className="field-label">새 토큰 <span className="hint-text">(저장 후 값은 다시 표시되지 않음)</span></span>
        <input type="password" autoComplete="off" value={tok} onChange={(e) => setTok(e.target.value)} placeholder="SecurityScorecard API Token" />
      </label>
      <div className="stc-actions">
        <PrimaryButton onClick={save} disabled={busy || !tok.trim()}>{busy ? '저장 중…' : '토큰 저장'}</PrimaryButton>
        {st?.source === 'db' && <SecondaryButton onClick={clear} disabled={busy}>삭제(env 폴백)</SecondaryButton>}
      </div>
      {msg && <p className="hint-text">{msg}</p>}
      <NoticeBox tone="info">토큰은 서버에서 <b>암호화 저장</b>되며 화면·로그·응답에 값이 노출되지 않습니다. 파트너는 이 토큰을 자동으로 사용합니다.</NoticeBox>
    </div>
  )
}

// 사용자 상세 팝업 — 이름·연락처·소속부서·역할 수정(관리자). 관리자 역할이면 SSC 토큰 카드 노출.
function UserDetailModal({ user, onClose, onSaved, app }) {
  const [f, setF] = useState({ name: user.name || '', phone: user.phone || '', department: user.department || '' })
  const [role, setRole] = useState(user.role)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      let updated = await apiUpdateUser(user.id, { name: f.name, phone: f.phone, department: f.department })
      if (role !== user.role) updated = await apiSetUserRole(user.id, role)
      app?.showToast?.('사용자 정보 저장됨')
      onSaved?.(updated); onClose()
    } catch (e) { app?.showToast?.(e?.payload?.message || '저장 실패') }
    finally { setBusy(false) }
  }
  return (
    <Modal title="사용자 상세" subtitle={user.email} onClose={onClose} size="md"
      footer={<>
        <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
        <PrimaryButton onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</PrimaryButton>
      </>}>
      <div className="modal-form">
        <Field label="이메일"><input value={user.email} disabled /></Field>
        <Field label="이름"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="이름" /></Field>
        <Field label="연락처"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="010-0000-0000" /></Field>
        <Field label="소속부서"><input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="예: 보안운영팀" /></Field>
        <Field label="역할"><select value={role} onChange={(e) => setRole(e.target.value)}><option value="viewer">뷰어 (읽기 전용)</option><option value="partner">파트너</option><option value="admin">관리자</option></select></Field>
      </div>
      <PasswordResetCard user={user} app={app} />
      {role === 'admin' && <SscTokenCard />}
    </Modal>
  )
}

// 관리자 전용 — 대상 사용자의 비밀번호 재설정(현재 비밀번호 불필요).
//  재설정하면 그 사용자의 모든 세션이 폐기되어 재로그인이 필요하다.
function PasswordResetCard({ user, app }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const tooShort = pw.length > 0 && pw.length < 8
  const mismatch = pw2.length > 0 && pw !== pw2
  const canSubmit = pw.length >= 8 && pw === pw2 && !busy

  const submit = async () => {
    if (!canSubmit) return
    if (!window.confirm(`${user.email} 의 비밀번호를 재설정할까요?\n해당 사용자의 모든 세션이 로그아웃됩니다.`)) return
    setBusy(true)
    try {
      await apiResetUserPassword(user.id, pw)
      setPw(''); setPw2('')
      app?.showToast?.({ tone: 'success', text: '비밀번호 재설정됨 — 해당 사용자는 다시 로그인해야 합니다' })
    } catch (e) { app?.showToast?.({ tone: 'danger', text: e?.payload?.message || '재설정 실패' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="mini-title">비밀번호 재설정 <span className="hint-text" style={{ fontWeight: 400 }}>관리자 전용</span></div>
      <div className="modal-form" style={{ marginTop: 10 }}>
        <Field label="새 비밀번호" required hint="8자 이상">
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호" />
        </Field>
        <Field label="새 비밀번호 확인" required>
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="한 번 더 입력" />
        </Field>
      </div>
      {tooShort && <p className="hint-text" style={{ color: 'var(--text-danger)' }}>8자 이상이어야 합니다.</p>}
      {mismatch && <p className="hint-text" style={{ color: 'var(--text-danger)' }}>두 입력이 일치하지 않습니다.</p>}
      <div style={{ marginTop: 10 }}>
        <SecondaryButton onClick={submit} disabled={!canSubmit}>{busy ? '재설정 중…' : '비밀번호 재설정'}</SecondaryButton>
      </div>
      <p className="hint-text" style={{ marginTop: 8 }}>재설정 시 해당 사용자의 <b>모든 기기 세션이 폐기</b>되며, 감사 로그에 기록됩니다(비밀번호 값은 기록되지 않음).</p>
    </div>
  )
}

// 사용자 관리 (관리자 전용) — 목록·생성·상세(수정)·역할·SSC 토큰
export function UsersAdmin({ app }) {
  const [users, setUsers] = useState([])
  const [status, setStatus] = useState('loading')
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'partner', phone: '', department: '' })
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [detailUser, setDetailUser] = useState(null)
  const load = () => { setStatus('loading'); fetchUsers().then((u) => { setUsers(u); setStatus('ok') }).catch((e) => setStatus(e?.status === 403 ? 'forbidden' : 'error')) }
  useEffect(load, [])
  const openAdd = () => { setForm({ email: '', password: '', name: '', role: 'partner', phone: '', department: '' }); setShowAdd(true) }
  const create = async () => {
    setBusy(true)
    try { await apiCreateUser(form); app?.showToast?.('사용자 생성됨'); setShowAdd(false); load() }
    catch (err) { app?.showToast?.(err?.payload?.message || '생성 실패') }
    finally { setBusy(false) }
  }
  return (
    <div className="page">
      <PageHeader title="사용자 관리" desc="계정 생성·정보 수정·역할 관리 · SSC API 토큰(조직 공용) · 관리자 전용"
        actions={status !== 'forbidden' ? <PrimaryButton onClick={openAdd}>+ 사용자 추가</PrimaryButton> : null} />
      {status === 'forbidden' && <NoticeBox tone="danger" title="권한 없음">관리자만 접근할 수 있습니다.</NoticeBox>}
      {status !== 'forbidden' && (
        <>
          <div className="card no-pad">
            <table className="data-table">
              <thead><tr><th className="dt-num">순번</th><th>이메일</th><th>이름</th><th>소속부서</th><th>역할</th></tr></thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className="clickable" onClick={() => setDetailUser(u)}>
                    <td className="dt-num">{i + 1}</td>
                    <td><code className="inline-code sm">{u.email}</code></td>
                    <td>{u.name}</td>
                    <td>{u.department || <span className="hint-text">—</span>}</td>
                    <td><span className={`badge badge-soft ${u.role === 'admin' ? 'badge-primary' : u.role === 'viewer' ? 'badge-warning' : 'badge-neutral'}`}>{{ admin: '관리자', partner: '파트너', viewer: '뷰어' }[u.role] || u.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint-text">행을 클릭하면 상세(이름·연락처·소속부서·역할 수정)가 열립니다. 관리자 상세에서 SSC API 토큰을 설정합니다.</p>
          {status === 'loading' && <p className="hint-text">불러오는 중…</p>}

          {detailUser && <UserDetailModal user={detailUser} app={app} onClose={() => setDetailUser(null)} onSaved={() => load()} />}

          {showAdd && (
            <Modal title="사용자 추가" subtitle="계정을 생성하면 목록에 추가됩니다 · 관리자 전용" onClose={() => setShowAdd(false)} size="md"
              footer={<>
                <SecondaryButton onClick={() => setShowAdd(false)}>취소</SecondaryButton>
                <PrimaryButton onClick={create} disabled={busy || !form.email || form.password.length < 8}>{busy ? '추가 중…' : '추가'}</PrimaryButton>
              </>}>
              <div className="modal-form">
                <Field label="이메일" required><input type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" autoFocus /></Field>
                <Field label="이름"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="이름 (선택)" /></Field>
                <Field label="연락처"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000 (선택)" /></Field>
                <Field label="소속부서"><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="예: 보안운영팀 (선택)" /></Field>
                <Field label="비밀번호" required hint="8자 이상"><input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="비밀번호" /></Field>
                <Field label="역할"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="viewer">뷰어 (읽기 전용)</option><option value="partner">파트너</option><option value="admin">관리자</option></select></Field>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  )
}

export function AuditLog() {
  const [kind, setKind] = useState('all')
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading') // loading|ok|error
  useEffect(() => {
    let alive = true
    setStatus('loading')
    fetchAudit({ kind, limit: 300 })
      .then((d) => { if (alive) { setRows(d.items); setStatus('ok') } })
      .catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [kind])

  const KIND_TABS = [{ key: 'all', label: '전체' }, { key: 'user', label: '사용자' }, { key: 'system', label: '시스템' }, { key: 'security', label: '보안' }]
  const KIND_KO = { user: '사용자', system: '시스템', security: '보안' }
  const KIND_TONE = { user: 'primary', system: 'neutral', security: 'warning' }
  const KO_ROLE = { admin: '관리자', partner: '파트너', viewer: '뷰어', system: '시스템' }
  const fmtTs = (ts) => { try { return new Date(ts).toLocaleString('ko-KR', { hour12: false }) } catch { return ts } }
  const bad = (r) => r === 'Denied' || r === 'Failed' || r === 'Fallback'
  const columns = [
    { key: 'ts', label: '시간' }, { key: 'kind', label: '종류' }, { key: 'actor', label: '행위자' },
    { key: 'action', label: '이벤트' }, { key: 'target', label: '대상' }, { key: 'result', label: '결과' }, { key: 'ip', label: 'IP' }
  ]
  const renderCell = (key, row) => {
    if (key === 'ts') return <span className="hint-text" style={{ whiteSpace: 'nowrap' }}>{fmtTs(row.ts)}</span>
    if (key === 'kind') return <span className={`badge badge-soft badge-${KIND_TONE[row.kind] || 'neutral'}`}>{KIND_KO[row.kind] || row.kind}</span>
    if (key === 'actor') return <span>{row.actor}{row.role ? <span className="hint-text"> · {KO_ROLE[row.role] || row.role}</span> : null}</span>
    if (key === 'action') return <strong>{row.action}</strong>
    if (key === 'target') return row.target ? <code className="inline-code sm">{row.target}</code> : <span className="hint-text">—</span>
    if (key === 'result') return <span className={`badge badge-soft ${bad(row.result) ? 'badge-danger' : 'badge-success'}`}>{row.result}</span>
    if (key === 'ip') return <span className="hint-text">{row.ip || '—'}</span>
    return row[key]
  }
  return (
    <div className="page">
      <PageHeader title="감사 로그" desc="사용자 행위 · 보안(인증·권한 거부) · 시스템(운영/DB) 이벤트를 실제로 기록합니다." />
      <div className="card picker-card" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="field-label" style={{ marginRight: 2 }}>종류</span>
        {KIND_TABS.map((t) => (
          <button key={t.key} className={`btn btn-xs ${kind === t.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setKind(t.key)}>{t.label}</button>
        ))}
        <span className="hint-text" style={{ marginLeft: 'auto' }}>{status === 'ok' ? `${rows.length}건` : ''}</span>
      </div>
      {status === 'loading' ? <div className="rf-skeleton">감사 로그 불러오는 중…</div>
        : status === 'error' ? <EmptyState title="감사 로그를 불러올 수 없습니다" desc="관리자 권한이 필요합니다 (Backend 연결 확인)." />
          : rows.length ? <div className="card no-pad"><DataTable columns={columns} rows={rows} renderCell={renderCell} rowId={(r) => r.id} pageSize={15} /></div>
            : <EmptyState title="기록된 이벤트가 없습니다" desc="사용자·보안·시스템 이벤트가 발생하면 여기에 자동 기록됩니다." />}

      {/* Partner Admin 내부용 — SSC API Smoke Test */}
      <div style={{ marginTop: 24 }}>
        <SscSmokeTest />
      </div>
    </div>
  )
}
