// =====================================================================
// SSC Partner Portal — 메인 셸 (Sidebar + Topbar + useState 기반 화면 전환)
// 외부 관측 기반 리스크 확인 + 보편 조치 권고 + 표준 검증 증적 + 고객 전달
// 모든 데이터는 mock data. 실제 API/DB/Docker/AI 호출 없음.
// =====================================================================
import React, { useState, useCallback, useEffect } from 'react'
import * as data from './data/mock.js'
import { Toast } from './components/common.jsx'
import { Icon } from './components/icons.jsx'
import { CustomerWizard, DomainModal, CustomerEditModal } from './features/Registration.jsx'
import LoginView from './features/Login.jsx'
import { refreshSession, logout as authLogout } from './lib/auth.js'
import { SSC_MODE, IS_BACKEND_MODE } from './lib/sscApi.js'
import { ENABLE_DEV_MOCKS } from './config/runtime.js'
import {
  fetchCustomers,
  fetchDomains,
  fetchEvidencePacks,
  apiAddCustomer,
  apiUpdateCustomer,
  apiDeleteCustomer,
  apiAddDomain,
  apiUpdateDomain,
  apiDeleteDomain,
  apiAddEvidencePack,
  apiUpdateEvidencePack,
  apiDeleteEvidencePack
} from './lib/portalApi.js'
import {
  Dashboard,
  Customers,
  Domains,
  RiskFindings,
  FindingDetail,
  RemediationGuides,
  ValidationSandbox,
  EvidencePacks,
  CustomerView,
  DeliveryReportViewer,
  AuditLog,
  SharedPackView,
  UsersAdmin
} from './pages/Pages.jsx'
import { LabStudio } from './pages/LabStudio.jsx'

// 사이드바 메뉴 정의
const NAV = [
  { key: 'dashboard', label: '대시보드', group: '개요' },
  { key: 'customers', label: '고객사', group: '점검 대상' },
  { key: 'domains', label: '도메인 등록', group: '점검 대상' },
  { key: 'findings', label: '리스크 점검', group: '리스크' },
  { key: 'sandbox', label: '검증랩 (참고 시연)', group: '검증 · 조치' },
  { key: 'guides', label: '조치 가이드', group: '검증 · 조치' },
  { key: 'evidence', label: '증적 팩', group: '검증 · 조치' },
  { key: 'customer-view', label: '고객 전달 화면', group: '전달' },
  { key: 'audit', label: '감사 로그', group: '전달' },
  { key: 'users', label: '사용자 관리', group: '관리', adminOnly: true },
  { key: 'lab-studio', label: '랩 스튜디오', group: '관리', adminOnly: true }
]

const PAGE_META = {
  dashboard: { crumb: '개요 / 대시보드' },
  customers: { crumb: '점검 대상 / 고객사' },
  domains: { crumb: '점검 대상 / 도메인 등록' },
  findings: { crumb: '리스크 / 리스크 점검' },
  'finding-detail': { crumb: '리스크 / 리스크 점검 / 상세' },
  guides: { crumb: '검증 · 조치 / 조치 가이드' },
  sandbox: { crumb: '검증 · 조치 / 검증랩' },
  evidence: { crumb: '검증 · 조치 / 증적 팩' },
  'customer-view': { crumb: '전달 / 고객 전달 화면' },
  audit: { crumb: '전달 / 감사 로그' },
  users: { crumb: '관리 / 사용자 관리' },
  'lab-studio': { crumb: '관리 / 랩 스튜디오' }
}

export default function App() {
  // 게시 링크(#share=<packId>) — 사이드바 없는 고객 전달 전용 뷰
  const [shareId] = useState(() => {
    if (typeof window === 'undefined') return null
    const m = /[#&?]share=([^&]+)/.exec(window.location.hash + window.location.search)
    return m ? decodeURIComponent(m[1]) : null
  })
  // 새창 리포트 뷰어(#report=<고객사>) — 사이드바 없는 전달 리포트 뷰어(인증 필요)
  const [reportKey] = useState(() => {
    if (typeof window === 'undefined') return null
    const m = /[#&?]report=([^&]+)/.exec(window.location.hash + window.location.search)
    return m ? decodeURIComponent(m[1]) : null
  })
  const [view, setView] = useState('dashboard')
  const [param, setParam] = useState(null) // 상세 화면용 id
  // 모바일(≤900px)에서는 사이드바를 기본으로 접어(숨겨) 시작
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 900)

  // 등록 흐름용 lifted state
  //  - customers·domains: 초기값은 오프라인 폴백용 시드. 인증 후 loadData()가 백엔드 실데이터로 교체.
  //  - findings: 백엔드 교체 경로가 없음 → 목업 시드 금지(빈 배열). 실제 리스크는 도메인별 수집(RiskFindingsRealPanel)으로 채워짐.
  const [customers, setCustomers] = useState(ENABLE_DEV_MOCKS ? data.customers : [])
  const [domains, setDomains] = useState(ENABLE_DEV_MOCKS ? data.domains : [])
  const [findings, setFindings] = useState(ENABLE_DEV_MOCKS ? data.findings : [])
  const [evidencePacks, setEvidencePacks] = useState([]) // 백엔드(lab) 기반 팩
  const [newCustomerId, setNewCustomerId] = useState(null)
  const [newDomainId, setNewDomainId] = useState(null)
  const [wizard, setWizard] = useState(null) // 'customer' | null
  const [domainModal, setDomainModal] = useState(null) // null | { mode, initial, preselect }
  const [customerEdit, setCustomerEdit] = useState(null) // null | customer
  const [persistMode, setPersistMode] = useState('loading') // 'loading' | 'backend' | 'local'
  const [toast, setToast] = useState(null)
  const [authStatus, setAuthStatus] = useState('checking') // 'checking' | 'authed' | 'anon'
  const [user, setUser] = useState(null)

  // 인증 후 백엔드 저장소 로드
  const loadData = useCallback(() => {
    Promise.all([fetchCustomers(), fetchDomains(), fetchEvidencePacks()])
      .then(([cs, ds, eps]) => {
        if (Array.isArray(cs)) setCustomers(cs)
        if (Array.isArray(ds)) setDomains(ds)
        if (Array.isArray(eps)) setEvidencePacks(eps)
        setPersistMode('backend')
      })
      .catch(() => setPersistMode('local'))
  }, [])

  // 마운트: 게시 링크가 아니면 세션 복원(무음 refresh) 시도
  useEffect(() => {
    if (shareId) return // 게시 뷰(#share)는 인증 불필요
    let alive = true
    refreshSession()
      .then((u) => { if (!alive) return; setUser(u); setAuthStatus('authed'); loadData() })
      .catch(() => { if (alive) setAuthStatus('anon') })
    return () => { alive = false }
  }, [shareId, loadData])

  const onLogin = useCallback((u) => { setUser(u); setAuthStatus('authed'); loadData() }, [loadData])
  const doLogout = useCallback(async () => { await authLogout(); setUser(null); setAuthStatus('anon') }, [])

  // 화면 전환 함수 (메뉴 클릭 / 상세 이동 공용)
  const navigate = useCallback((next, id = null) => {
    setView(next)
    setParam(id)
    window.scrollTo({ top: 0 })
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setCollapsed(true) // 모바일: 이동 후 사이드바 닫기
  }, [])

  // 권한 미러(백엔드 permsForRole 소비). 실제 차단은 백엔드 requirePerm — 여기선 UX(버튼 숨김/비활성)용.
  const can = useCallback((resource, action = 'write') => {
    const p = user?.permissions?.[resource]
    return !!(p && p[action])
  }, [user])

  const showToast = useCallback((msg) => setToast(msg), [])
  // 저장 실패 시 사용자에게 경고(로컬만 반영됨)
  const warnPersist = useCallback((e) => {
    if (e?.code === 'BACKEND_UNREACHABLE') setToast({ tone: 'warning', text: 'Backend 미연결 — 화면에만 반영됨(영구 저장 안 됨). backend를 실행하세요.' })
    else setToast({ tone: 'warning', text: '저장 실패 — 화면에만 반영됨.' })
  }, [])

  const addCustomer = useCallback((c) => {
    setCustomers((prev) => [c, ...prev])
    setNewCustomerId(c.id)
    apiAddCustomer(c).catch(warnPersist)
  }, [warnPersist])
  const addDomain = useCallback((d) => {
    setDomains((prev) => [d, ...prev])
    setNewDomainId(d.id)
    apiAddDomain(d).catch(warnPersist)
  }, [warnPersist])
  const updateDomain = useCallback((row) => {
    setDomains((prev) => prev.map((d) => (d.id === row.id ? row : d)))
    apiUpdateDomain(row.id, row).catch(warnPersist)
  }, [warnPersist])
  const deleteDomain = useCallback((id) => {
    setDomains((prev) => prev.filter((d) => d.id !== id))
    apiDeleteDomain(id).catch(warnPersist)
  }, [warnPersist])
  const updateCustomer = useCallback((id, patch) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    apiUpdateCustomer(id, patch).catch(warnPersist)
  }, [warnPersist])
  const deleteCustomer = useCallback((id) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id))
    apiDeleteCustomer(id).catch(warnPersist)
  }, [warnPersist])
  const addFindings = useCallback((list) => {
    if (!list || !list.length) return
    setFindings((prev) => [...list, ...prev])
  }, [])
  const addEvidencePack = useCallback((p) => {
    setEvidencePacks((prev) => [p, ...prev.filter((x) => x.id !== p.id)])
    apiAddEvidencePack(p).catch(warnPersist)
  }, [warnPersist])
  const updateEvidencePack = useCallback((id, patch) => {
    setEvidencePacks((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    apiUpdateEvidencePack(id, patch).catch(warnPersist)
  }, [warnPersist])
  const deleteEvidencePack = useCallback((id) => {
    setEvidencePacks((prev) => prev.filter((p) => p.id !== id))
    apiDeleteEvidencePack(id).catch(warnPersist)
  }, [warnPersist])

  // 페이지로 내려줄 앱 핸들러 묶음
  const app = {
    navigate,
    user,
    customers,
    domains,
    findings,
    evidencePacks,
    newCustomerId,
    newDomainId,
    showToast,
    can,
    addFindings,
    addEvidencePack,
    updateEvidencePack,
    deleteEvidencePack,
    updateDomain,
    deleteDomain,
    deleteCustomer,
    persistMode,
    sscMode: SSC_MODE,
    isBackendMode: IS_BACKEND_MODE,
    openCustomerWizard: () => setWizard('customer'),
    openCustomerEdit: (customer) => setCustomerEdit(customer),
    openDomainModal: (customerName = null) => setDomainModal({ mode: 'create', preselect: customerName }),
    openDomainEdit: (row) => setDomainModal({ mode: 'edit', initial: row })
  }

  const activeKey = view === 'finding-detail' ? 'findings' : view

  const renderPage = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard app={app} />
      case 'customers':
        return <Customers app={app} />
      case 'domains':
        return <Domains app={app} />
      case 'findings':
        return <RiskFindings app={app} />
      case 'finding-detail':
        return <FindingDetail findingId={param} app={app} />
      case 'guides':
        return <RemediationGuides app={app} focusIssueType={param} />
      case 'sandbox':
        return <ValidationSandbox app={app} focus={param} />
      case 'evidence':
        return <EvidencePacks app={app} />
      case 'customer-view':
        return <CustomerView app={app} />
      case 'audit':
        return <AuditLog />
      case 'users':
        return <UsersAdmin app={app} />
      case 'lab-studio':
        return <LabStudio app={app} />
      default:
        return <Dashboard app={app} />
    }
  }

  const groups = NAV.filter((item) => !item.adminOnly || user?.role === 'admin').reduce((acc, item) => {
    ;(acc[item.group] = acc[item.group] || []).push(item)
    return acc
  }, {})

  // 게시 링크로 접근 시: 포털 셸 없이 증적만 렌더 (인증 우회)
  if (shareId) return <SharedPackView token={shareId} />
  // 인증 게이트
  if (authStatus === 'checking') return <div className="auth-splash">세션 확인 중…</div>
  if (authStatus === 'anon') return <LoginView onSuccess={onLogin} />
  // 새창 리포트 뷰어(#report=) — 인증 후 사이드바 없이 리포트만 렌더
  if (reportKey) return <DeliveryReportViewer custName={reportKey} app={app} />

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">SS</div>
          {!collapsed && (
            <div className="brand-text">
              <div className="brand-name">SSC 파트너 포털</div>
              <div className="brand-sub">보안 리스크 점검 · 검증</div>
            </div>
          )}
        </div>

        <nav className="nav">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="nav-group">
              {!collapsed && <div className="nav-group-label">{group}</div>}
              {items.map((item) => (
                <button
                  key={item.key}
                  className={`nav-item ${activeKey === item.key ? 'active' : ''}`}
                  onClick={() => navigate(item.key)}
                  title={item.label}
                >
                  <span className="nav-icon"><Icon name={item.key} /></span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <div className="env-note">
              <span className="env-dot" /> 임시 저장(메모리) · SSC 읽기 전용
            </div>
          )}
        </div>
      </aside>

      {/* 모바일: 사이드바 열림 시 뒷배경(클릭하면 닫힘) */}
      <div className="nav-backdrop" onClick={() => setCollapsed(true)} />

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} title="사이드바 토글">
              <Icon name="menu" size={18} />
            </button>
            <div className="breadcrumb">{PAGE_META[view]?.crumb || ''}</div>
          </div>
          <div className="topbar-right">
            <button className="icon-btn" title="알림"><Icon name="bell" size={18} /><span className="badge-dot" /></button>
            <div className="user-chip">
              <div className="avatar">{(user?.name || user?.email || 'U').trim().slice(0, 2).toUpperCase()}</div>
              <div className="user-meta">
                <div className="user-name">{user?.name || user?.email || '사용자'}</div>
                <div className="user-role">{{ admin: 'Admin', partner: 'Partner', viewer: 'Viewer · 읽기 전용' }[user?.role] || user?.role || ''} · {user?.email || ''}</div>
              </div>
            </div>
            <button className="icon-btn" onClick={doLogout} title="로그아웃">⏻</button>
          </div>
        </header>

        <main className="content">{renderPage()}</main>
      </div>

      {/* 전역 오버레이: Wizard / Modal / Toast */}
      {wizard === 'customer' && (
        <CustomerWizard onClose={() => setWizard(null)} onRegister={addCustomer} onRegisterDomain={addDomain} showToast={showToast} persisted={persistMode === 'backend'} />
      )}
      {domainModal && (
        <DomainModal
          mode={domainModal.mode}
          initial={domainModal.initial}
          initialCustomer={domainModal.preselect}
          customers={customers}
          existingDomains={domains}
          onClose={() => setDomainModal(null)}
          onSubmit={(row, mode) => (mode === 'edit' ? updateDomain(row) : addDomain(row))}
          showToast={showToast}
        />
      )}
      {customerEdit && (
        <CustomerEditModal
          customer={customerEdit}
          onClose={() => setCustomerEdit(null)}
          onSubmit={updateCustomer}
          showToast={showToast}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
