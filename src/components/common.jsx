// =====================================================================
// 재사용 가능한 공통 UI 컴포넌트
// Sidebar / Topbar / StatCard / DataTable / StatusBadge / SeverityBadge
// EvidenceCard / BeforeAfterDiff / Stepper / ReviewPanel / EmptyState
// MockScreenshot / ActivityLog
// + PrimaryButton / SecondaryButton / Modal / WizardSteps / ProgressTimeline
// + Toast / SourceBadge / ImportProgressPanel / RegistrationSummaryCard
// =====================================================================
import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Ban, Info, CheckCircle2, Inbox, Link2, Eye, FlaskConical, PenLine, Circle } from 'lucide-react'

// 상태 → 색상 톤 매핑
const STATUS_TONE = {
  // workflow / general
  Observed: 'neutral',
  'Guide Drafted': 'primary',
  'Lab Evidence Ready': 'primary',
  Approved: 'success',
  Delivered: 'success',
  'Customer Reviewing': 'primary',
  'Re-observation Requested': 'warning',
  Closed: 'neutral',
  // customer status
  Active: 'success',
  Review: 'warning',
  Suspended: 'danger',
  // scope status
  'In Scope': 'success',
  'Pending Consent': 'warning',
  Restricted: 'neutral',
  // evidence / guide
  Ready: 'success',
  Generating: 'primary',
  Pending: 'neutral',
  Drafted: 'primary',
  'Draft Needed': 'warning',
  Validated: 'success',
  'In Review': 'warning',
  Draft: 'neutral',
  Pass: 'success',
  // sandbox
  Success: 'success',
  Running: 'primary',
  Failed: 'danger',
  Generated: 'success',
  None: 'neutral',
  'PoC Evidence Generated': 'success',
  'Standard Lab PoC Completed': 'success',
  'Partner Lab PoC Evidence Ready': 'purple',
  // publish
  Published: 'success',
  // review
  'On Hold': 'neutral',
  'Not Started': 'neutral',
  // delivery
  'Not Delivered': 'neutral',
  // workflow (SSC 재스캔/공식 검증 포함)
  'Customer Registered': 'neutral',
  'Domain Scope Registered': 'neutral',
  'SSC Risk Imported': 'primary',
  'External Observation Added': 'primary',
  'Advisory Drafted': 'primary',
  'Partner Lab PoC Ready': 'purple',
  'Partner Lab Evidence Pending': 'neutral',
  'Evidence Pack Ready': 'primary',
  'Delivered to Customer': 'success',
  'Customer Remediation In Progress': 'primary',
  'SSC Re-scan Required': 'orange',
  'SSC Re-scan Confirmed': 'success',
  'Closed by Customer': 'neutral',
  // misc
  열람: 'success',
  미열람: 'neutral',
  '동의 완료': 'success',
  '검토 중': 'warning'
}

// 상태 표시용 한글 라벨(표시 전용 — 내부 값/색상 로직은 원본 유지)
const KO_STATUS = {
  'In Review': '검수 중', Draft: '초안', Approved: '승인됨', Published: '발행됨',
  'In Scope': '점검 범위 내', 'Pending Consent': '동의 대기', Restricted: '제한됨',
  Success: '성공', None: '없음', Failed: '실패', Pending: '대기', Pass: '통과',
  'Delivered to Customer': '고객 전달됨', 'Not Delivered': '미전달',
  'Customer Reviewing': '고객 검토 중', 'Partner Lab PoC Ready': '검증랩 증적 준비됨',
  'Partner Lab Evidence Pending': '검증랩 증적 대기', 'Evidence Pack Ready': '증적 팩 준비됨',
  'SSC Risk Imported': 'SSC 리스크 수집됨', 'External Observation Added': '외부 관측 추가됨',
  'Advisory Drafted': '권고 초안 작성됨', 'Customer Remediation In Progress': '고객 조치 진행 중',
  'SSC Re-scan Required': 'SSC 재스캔 필요', 'SSC Re-scan Confirmed': 'SSC 재스캔 확인됨',
  Drafted: '초안 작성됨', 'Draft Needed': '초안 필요', 'Guide Drafted': '가이드 초안',
  'Lab Evidence Ready': '검증랩 증적 준비됨', Generating: '생성 중', Running: '실행 중',
  Validated: '검토 완료', Reviewing: '검토 중', 'Customer Viewed': '고객 열람',
  Active: '활성', Suspended: '일시중지', Review: '검토', Ready: '준비', 'On Hold': '보류',
  'SSC Import 대기': 'SSC 수집 대기', 'PoC Evidence Generated': '참고 증적 생성됨',
  'AI Draft Ready': 'AI 초안 준비됨', 'Guide Reviewed': '가이드 검토 완료', Rejected: '반려됨'
}
// 리스크 수집 결과 상태(write-back) — 등록 기본 'SSC 수집 대기' 와 구분되는 실측 상태.
Object.assign(STATUS_TONE, { '리스크 수집됨': 'success', '수집됨 · Finding 없음': 'neutral', 'SSC 수집 대기': 'warning', 'SSC Import 대기': 'warning' })
export function StatusBadge({ status }) {
  const tone = STATUS_TONE[status] || 'neutral'
  return <span className={`badge badge-soft badge-${tone}`}>{KO_STATUS[status] || status}</span>
}

// 대상(엔드포인트) 컨텍스트 4필드 — 검증랩·조치 가이드·리스크 점검 등에서 공용(필드 문구·순서 통일).
//  · 정규화 값(customer/serviceEndpoint/sscLookupDomain/accessUrl)을 받아 렌더. extra 로 화면별 추가 필드.
export function EndpointContext({ customer, serviceEndpoint, sscLookupDomain, accessUrl, extra }) {
  return (
    <div className="kv compact endpoint-preview">
      <div><span>고객사</span><b>{customer || '—'}</b></div>
      <div><span>서비스 Endpoint</span><b>{serviceEndpoint || '—'}</b></div>
      <div><span>SSC 조회 기준</span><b>{sscLookupDomain || '—'}</b></div>
      <div><span>접속 검증 URL</span><b>{accessUrl || '—'}</b></div>
      {extra}
    </div>
  )
}

const SEVERITY_TONE = { critical: 'danger', high: 'danger', medium: 'warning', low: 'neutral', info: 'neutral' }
const KO_SEV = { critical: '심각', high: '높음', medium: '보통', low: '낮음', info: '정보' }
export function SeverityBadge({ level }) {
  const key = String(level || '').toLowerCase()
  const tone = SEVERITY_TONE[key] || 'neutral'
  const label = KO_SEV[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : String(level))
  return (
    <span className={`badge badge-soft badge-${tone}`}>
      <span className={`dot dot-${tone}`} />
      {label}
    </span>
  )
}

export function StatCard({ icon, label, value, unit, trend, tone = 'primary' }) {
  const up = trend && trend.startsWith('+') && trend !== '+0'
  return (
    <div className="statcard">
      <div className="statcard-top">
        <div className={`statcard-icon tone-${tone}`}>{icon}</div>
        {trend && trend !== '0' && (
          <span className={`statcard-trend ${up ? 'up' : 'flat'}`}>{up ? '↑' : '→'} {trend}</span>
        )}
      </div>
      <div className="statcard-label">{label}</div>
      <div className="statcard-value">
        {value}
        {unit && <span className="statcard-unit">{unit}</span>}
      </div>
    </div>
  )
}

// SSC 점수 배지 (등급 컬러 + 수치). loading=undefined, 없음=null
export function ScoreBadge({ score, grade, loading = false }) {
  if (loading) return <span className="muted-cell">…</span>
  if (score == null && !grade) return <span className="muted-cell">—</span>
  const g = String(grade || '').toUpperCase()
  const tone = { A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' }[g] || 'na'
  return (
    <span className="score-badge">
      <span className={`score-grade grade-${tone}`}>{g || '?'}</span>
      <b className="score-num">{score ?? '—'}</b>
    </span>
  )
}

export function DataTable({
  columns, rows, onRowClick, renderCell, emptyText = '데이터가 없습니다.',
  selectable = false, selected = [], onSelectedChange, rowId = (r, i) => (r?.id ?? i),
  numbered = true, // 순번 열(체크박스 뒤). 전 목록 일관성 위해 기본 on
  pageSize = 0 // 0 = 페이지네이션 없음
}) {
  const paginated = pageSize > 0
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(pageSize || 10)
  const total = rows ? rows.length : 0
  const pageCount = paginated ? Math.max(1, Math.ceil(total / size)) : 1
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [pageCount, page])
  const cur = Math.min(page, pageCount)
  const start = paginated ? (cur - 1) * size : 0
  const view = paginated ? (rows || []).slice(start, start + size) : (rows || [])

  if (!rows || rows.length === 0) {
    return <EmptyState title="표시할 항목 없음" desc={emptyText} />
  }

  const ids = view.map((r, i) => rowId(r, start + i)) // 현재 페이지 기준
  const selSet = new Set(selected)
  const allSel = ids.length > 0 && ids.every((id) => selSet.has(id))
  const someSel = ids.some((id) => selSet.has(id))
  const toggleAll = () => {
    if (!onSelectedChange) return
    onSelectedChange(allSel ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }
  const toggleRow = (id) => {
    if (!onSelectedChange) return
    onSelectedChange(selSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {selectable && (
              <th className="dt-check">
                <input type="checkbox" checked={allSel} ref={(el) => { if (el) el.indeterminate = !allSel && someSel }} onChange={toggleAll} aria-label="전체 선택" />
              </th>
            )}
            {numbered && <th className="dt-num">순번</th>}
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.map((row, i) => {
            const id = rowId(row, start + i)
            const isSel = selSet.has(id)
            return (
              <tr
                key={id}
                className={`${onRowClick ? 'clickable' : ''} ${isSel ? 'row-selected' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selectable && (
                  <td className="dt-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleRow(id)} aria-label="행 선택" />
                  </td>
                )}
                {numbered && <td className="dt-num">{start + i + 1}</td>}
                {columns.map((c) => (
                  <td key={c.key} data-label={c.label}>
                    {renderCell ? renderCell(c.key, row) : row[c.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {paginated && (
        <div className="dt-pagination">
          <span className="dt-page-info">{total === 0 ? 0 : start + 1}–{Math.min(start + size, total)} / 총 {total}건</span>
          <div className="dt-page-controls">
            <button className="dt-page-btn" disabled={cur <= 1} onClick={() => setPage(1)} aria-label="처음">«</button>
            <button className="dt-page-btn" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="이전">‹</button>
            <span className="dt-page-cur">{cur} / {pageCount}</span>
            <button className="dt-page-btn" disabled={cur >= pageCount} onClick={() => setPage(cur + 1)} aria-label="다음">›</button>
            <button className="dt-page-btn" disabled={cur >= pageCount} onClick={() => setPage(pageCount)} aria-label="마지막">»</button>
          </div>
          <label className="dt-page-size">페이지당
            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1) }}>
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

// 선택 행 일괄 작업 바 + Actions 드롭다운 (전역 재사용)
export function BulkActionsBar({ count = 0, actions = [], onClear }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  if (!count) return null
  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count}개 선택됨</span>
      <div className="bulk-actions" ref={ref}>
        <button className={`bulk-actions-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
          작업 <span className="bulk-caret">▾</span>
        </button>
        {open && (
          <div className="bulk-menu">
            {actions.map((a, i) => (
              <button key={i} className={`bulk-menu-item ${a.danger ? 'danger' : ''}`} onClick={() => { a.onClick?.(); setOpen(false) }}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="bulk-clear" onClick={onClear}>선택 해제</button>
    </div>
  )
}

// 선택 행 CSV 내보내기 (비파괴, 백엔드 불필요)
export function exportRowsToCsv(rows, columns, filename = 'export.csv') {
  const esc = (v) => {
    const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => esc((c.get ? c.get(r) : r[c.key]))).join(',')).join('\n')
  const csv = '﻿' + header + '\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function MockScreenshot({ label, variant = 'before', height = 150 }) {
  return (
    <div className={`mock-shot mock-${variant}`} style={{ height }}>
      <div className="mock-shot-bar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-url">{variant === 'after' ? 'https://…/remediated' : variant === 'before' ? 'https://…/vulnerable' : 'https://…'}</span>
      </div>
      <div className="mock-shot-body">
        <div className="mock-line w70" />
        <div className="mock-line w90" />
        <div className="mock-line w50" />
        <div className="mock-block" />
        <div className="mock-line w80" />
        <div className="mock-line w40" />
      </div>
      <div className="mock-shot-label">{label}</div>
    </div>
  )
}

export function EvidenceCard({ title, subtitle, badge, children, accent }) {
  return (
    <div className={`evidence-card ${accent ? `accent-${accent}` : ''}`}>
      <div className="evidence-card-head">
        <div>
          <h4>{title}</h4>
          {subtitle && <div className="evidence-card-subtitle">{subtitle}</div>}
        </div>
        {badge}
      </div>
      <div className="evidence-card-body">{children}</div>
    </div>
  )
}

export function BeforeAfterDiff({ rows }) {
  return (
    <table className="diff-table">
      <thead>
        <tr>
          <th>항목</th>
          <th>Before (취약 상태)</th>
          <th />
          <th>After (조치 후)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.changed ? 'diff-changed' : ''}>
            <td className="diff-key">{r.key}</td>
            <td className="diff-before">{r.before}</td>
            <td className="diff-arrow">{r.changed ? '→' : '='}</td>
            <td className="diff-after">{r.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Stepper({ steps, current }) {
  const idx = steps.indexOf(current)
  return (
    <ol className="stepper">
      {steps.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'active' : 'todo'
        return (
          <li key={s} className={`step step-${state}`}>
            <span className="step-marker">{i < idx ? '✓' : i + 1}</span>
            <span className="step-label">{s}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function BanCheckList({ items }) {
  return (
    <ul className="ban-list">
      {items.map((b) => (
        <li key={b.label} className={b.pass ? 'ban-pass' : 'ban-fail'}>
          <span className="ban-icon">{b.pass ? '✓' : '!'}</span>
          {b.label}
          <span className="ban-result">{b.pass ? '통과' : '검토'}</span>
        </li>
      ))}
    </ul>
  )
}

const KO_ACTOR = { 'AI Browser Agent': 'AI 에이전트', 'Customer Viewer': '고객 열람자', 'Customer Security Manager': '고객 보안 담당' }
const KO_ROLE_A = { system: '시스템', 'Partner Engineer': '파트너 엔지니어', 'Customer Viewer': '고객 열람자', 'Customer Security Manager': '고객 보안 담당' }
export function ActivityLog({ items }) {
  return (
    <ul className="activity-log">
      {items.map((a, i) => (
        <li key={i}>
          <span className={`activity-dot dot-${a.tone}`} />
          <div className="activity-content">
            <div className="activity-text">{a.text}</div>
            <div className="activity-meta">
              <strong>{KO_ACTOR[a.actor] || a.actor}</strong>
              {a.role && <span className="activity-role">{KO_ROLE_A[a.role] || a.role}</span>}
              <span className="activity-time">{a.time}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function EmptyState({ title, desc }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Inbox size={28} strokeWidth={1.6} /></div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
    </div>
  )
}

export function NoticeBox({ children, tone = 'info', title }) {
  // Lucide 아이콘으로 통일(상용 톤): 경고=AlertTriangle · 오류=Ban · 정보=Info
  const NoticeIcon = tone === 'warning' ? AlertTriangle : tone === 'danger' ? Ban : Info
  const icon = <NoticeIcon size={16} strokeWidth={2} aria-hidden="true" />
  return (
    <div className={`notice notice-${tone}`}>
      <span className="notice-icon">{icon}</span>
      <div>
        {title && <div className="notice-title">{title}</div>}
        <div className="notice-body">{children}</div>
      </div>
    </div>
  )
}

export function SectionTitle({ kicker, title, action }) {
  return (
    <div className="section-title">
      <div>
        {kicker && <div className="section-kicker">{kicker}</div>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, desc, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------
export function PrimaryButton({ children, onClick, type = 'button', disabled, full }) {
  return (
    <button type={type} className={`btn btn-primary ${full ? 'btn-full' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
export function SecondaryButton({ children, onClick, type = 'button', disabled, full, className = '' }) {
  return (
    <button type={type} className={`btn btn-secondary ${full ? 'btn-full' : ''} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------
export function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal modal-${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// 코드 스니펫 — 언어/파일명 라벨 + 복사·다운로드 (다크). 구문 강조는 없음(의존성 0).
//  - children 을 주면 커스텀 본문(예: config diff의 +/- 라인)을, 없으면 <pre>{code}</pre> 렌더.
//  - code 는 복사·다운로드 대상 텍스트(diff는 적용본만 전달).
const LANG_EXT = { nginx: 'conf', apache: 'conf', conf: 'conf', bash: 'sh', shell: 'sh', sh: 'sh', js: 'js', javascript: 'js', ts: 'ts', html: 'html', json: 'json', yaml: 'yaml', yml: 'yaml' }
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    document.execCommand('copy'); document.body.removeChild(ta)
  } catch { /* noop */ }
}
export function CodeBlock({ lang = 'text', label, filename, code = '', children }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(flash).catch(() => { legacyCopy(code); flash() })
    } else { legacyCopy(code); flash() }
  }
  const download = () => {
    const name = filename || `snippet.${LANG_EXT[String(lang).toLowerCase()] || 'txt'}`
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="code-snip">
      <div className="code-snip-head">
        <span className="code-snip-lang">{label || lang}</span>
        <div className="code-snip-actions">
          <button type="button" className="code-snip-btn" onClick={copy}>{copied ? '✓ 복사됨' : '⧉ 복사'}</button>
          <button type="button" className="code-snip-btn" onClick={download}>↓ 다운로드</button>
        </div>
      </div>
      {children ? <div className="code-snip-body">{children}</div> : <pre className="code-snip-body">{code}</pre>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Slide-over Drawer (우측) — 상세 문서형 레이아웃 (탭 아님, 세로 스크롤)
//  - 상단 sticky header(제목/부제/badge) + 본문 섹션 스크롤 + 하단 sticky action bar
// ---------------------------------------------------------------------
// 폭 프리셋(상용 사이드 패널 관례 — MS Fluent Panel S/M/L/XL 식) + 가장자리 드래그 리사이즈.
//  · 사용자 선택은 localStorage 로 유지(다음 드로어도 같은 폭). 드래그 시 px 로 미세 조절.
const DRAWER_SIZES = ['md', 'lg', 'xl']
const DRAWER_SIZE_LABEL = { md: '표준', lg: '넓게', xl: '최대' }

export function Drawer({ title, subtitle, badges, onClose, children, footer, width = 'lg' }) {
  const [size, setSize] = useState(() => {
    try { const s = localStorage.getItem('drawerSize'); return DRAWER_SIZES.includes(s) ? s : width } catch { return width }
  })
  const [dragW, setDragW] = useState(null) // 드래그 폭(px) — 설정 시 프리셋 대신 적용
  const chooseSize = (s) => { setSize(s); setDragW(null); try { localStorage.setItem('drawerSize', s) } catch { /* ignore */ } }

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const startResize = (e) => {
    e.preventDefault()
    const onMove = (ev) => {
      const w = Math.min(window.innerWidth - 40, Math.max(420, window.innerWidth - ev.clientX))
      setDragW(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className={`drawer drawer-${dragW ? 'custom' : size}`}
        style={dragW ? { width: dragW, maxWidth: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true"
      >
        <div className="drawer-resizer" onMouseDown={startResize} title="드래그해서 폭 조절" aria-hidden="true" />
        <div className="drawer-head">
          <div className="drawer-head-main">
            <h3>{title}</h3>
            {subtitle && <p className="drawer-sub">{subtitle}</p>}
            {badges && <div className="drawer-badges">{badges}</div>}
          </div>
          <div className="drawer-head-actions">
            <div className="drawer-size-ctrl" role="group" aria-label="드로어 폭">
              {DRAWER_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`drawer-size-btn ${!dragW && size === s ? 'active' : ''}`}
                  onClick={() => chooseSize(s)}
                >{DRAWER_SIZE_LABEL[s]}</button>
              ))}
            </div>
            <button className="modal-close" onClick={onClose} aria-label="닫기">×</button>
          </div>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// 고객사 → 등록 Endpoint 선택기 (Risk Findings / Validation Sandbox 공용)
//  - 도메인 row의 serviceEndpoint/sscLookupDomain/accessUrl를 그대로 사용(포트 보존).
//  - onSelect({ customer, domainRow, serviceEndpoint, accessUrl, sscLookupDomain })
// ---------------------------------------------------------------------
function normalizeEndpoint(customerName, d) {
  if (!d) return null
  const serviceEndpoint = d.serviceEndpoint || d.primary || ''
  const sscLookupDomain = d.sscLookupDomain || serviceEndpoint.split(':')[0]
  const accessUrl = d.accessUrl || d.baseUrl || (serviceEndpoint ? `https://${serviceEndpoint}` : '')
  return { customer: customerName, domainRow: d, domainId: d.id, serviceEndpoint, sscLookupDomain, accessUrl, consent: d.consent, status: d.status }
}

export function CustomerEndpointSelect({ customers = [], domains = [], onSelect, autoSelectFirst = true, customer, onCustomerChange }) {
  const controlled = customer !== undefined
  const [custInner, setCustInner] = useState(customers[0]?.name || '')
  const cust = controlled ? (customer || '') : custInner
  const setCust = (v) => { onCustomerChange?.(v); if (!controlled) setCustInner(v) }
  const custDomains = (domains || []).filter((d) => d.customer === cust)
  const [domId, setDomId] = useState(custDomains[0]?.id || '')

  const effDomId = custDomains.some((d) => d.id === domId) ? domId : (custDomains[0]?.id || '')
  const selectedDomain = custDomains.find((d) => d.id === effDomId) || null
  const ep = normalizeEndpoint(cust, selectedDomain)

  useEffect(() => {
    if (autoSelectFirst) onSelect?.(ep)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cust, effDomId])

  return (
    <div className="ce-select">
      <label className="field">
        <span className="field-label">고객사 선택</span>
        <select value={cust} onChange={(e) => { setCust(e.target.value); const first = (domains || []).find((d) => d.customer === e.target.value); setDomId(first?.id || '') }}>
          {customers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">등록 Endpoint 선택</span>
        <select value={effDomId} onChange={(e) => setDomId(e.target.value)} disabled={!custDomains.length}>
          {custDomains.length
            ? custDomains.map((d) => <option key={d.id} value={d.id}>{d.serviceEndpoint || d.primary}</option>)
            : <option value="">등록된 Endpoint 없음</option>}
        </select>
      </label>
      {ep ? (
        <div className="kv compact ce-context">
          <div><span>Service Endpoint</span><b>{ep.serviceEndpoint || '—'}</b></div>
          <div><span>Access URL</span><b>{ep.accessUrl || '—'}</b></div>
          <div><span>SSC Lookup Domain</span><b>{ep.sscLookupDomain || '—'}</b></div>
          <div><span>Consent / Status</span><b>{ep.consent || '—'} · {ep.status || '—'}</b></div>
        </div>
      ) : (
        <NoticeBox tone="warning">선택한 고객사에 등록된 Endpoint가 없습니다. <b>Domains &amp; Scope</b>에서 먼저 등록하세요.</NoticeBox>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// 전역 재사용 필터 바 (Notion식 필터 추가/제거) — 어느 표 화면에서나 사용
//  - fields: [{ key, label, type:'select'|'text', options?:[...], get?:(row)=>value }]
//  - filters: [{ id, field, value }]  (다중 조건 AND)
//  - search + searchKeys: 항상 보이는 통합 검색(지정 필드 대상 substring)
// ---------------------------------------------------------------------
export function applyFilters(rows, filters = [], fields = [], search = '', searchKeys = []) {
  const getter = (field) => field?.get || ((r) => r[field.key])
  let out = rows || []
  for (const fl of filters) {
    if (fl.value === '' || fl.value == null) continue
    const field = fields.find((x) => x.key === fl.field)
    if (!field) continue
    const get = getter(field)
    if (field.type === 'text') {
      const q = String(fl.value).toLowerCase()
      out = out.filter((r) => String(get(r) ?? '').toLowerCase().includes(q))
    } else {
      out = out.filter((r) => String(get(r) ?? '') === String(fl.value))
    }
  }
  if (search && searchKeys.length) {
    const q = search.toLowerCase()
    out = out.filter((r) =>
      searchKeys.some((k) => {
        const field = fields.find((x) => x.key === k)
        const get = getter(field || { key: k })
        return String(get(r) ?? '').toLowerCase().includes(q)
      })
    )
  }
  return out
}

const FunnelIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </svg>
)
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
)

export function FilterBar({ fields = [], filters = [], onChange, search, onSearchChange, searchPlaceholder = '검색', resultCount = null }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const addFilter = (key) => {
    const field = fields.find((f) => f.key === key)
    const def = field.type === 'select' ? (field.options?.[0] ?? '') : ''
    onChange([...filters, { id: `${key}-${Date.now()}-${filters.length}`, field: key, value: def }])
    setMenuOpen(false)
  }
  const setVal = (id, value) => onChange(filters.map((fl) => (fl.id === id ? { ...fl, value } : fl)))
  const remove = (id) => onChange(filters.filter((fl) => fl.id !== id))
  const clearAll = () => onChange([])
  const usedKeys = new Set(filters.map((f) => f.field))

  return (
    <div className="filter-bar">
      {onSearchChange && (
        <div className="filter-search">
          <span className="filter-search-icon"><SearchIcon /></span>
          <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder={searchPlaceholder} />
        </div>
      )}

      {filters.map((fl) => {
        const field = fields.find((x) => x.key === fl.field)
        if (!field) return null
        return (
          <span key={fl.id} className={`filter-chip ${fl.value ? 'active' : ''}`}>
            <span className="fc-label">{field.label}</span>
            <span className="fc-op">{field.type === 'text' ? '⊃' : '='}</span>
            {field.type === 'select' ? (
              <select className="fc-input" value={fl.value} onChange={(e) => setVal(fl.id, e.target.value)}>
                <option value="">전체</option>
                {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input className="fc-input" value={fl.value} onChange={(e) => setVal(fl.id, e.target.value)} placeholder="값 입력" />
            )}
            <button className="fc-remove" onClick={() => remove(fl.id)} aria-label="필터 제거">×</button>
          </span>
        )
      })}

      <div className="filter-add" ref={menuRef}>
        <button className={`filter-add-btn ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen((o) => !o)}>
          <FunnelIcon /> 필터
        </button>
        {menuOpen && (
          <div className="filter-menu">
            <div className="filter-menu-head">필터 기준 선택</div>
            {fields.map((f) => (
              <button key={f.key} className="filter-menu-item" disabled={usedKeys.has(f.key)} onClick={() => addFilter(f.key)}>
                <span className="fmi-type">{f.type === 'text' ? 'Aa' : '☰'}</span>
                <span className="fmi-label">{f.label}</span>
                {usedKeys.has(f.key) && <span className="fmi-used">적용됨</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {filters.length > 0 && <button className="filter-clear" onClick={clearAll}>초기화</button>}
      {resultCount != null && <span className="filter-count">{resultCount}건</span>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Wizard step indicator (수평)
// ---------------------------------------------------------------------
export function WizardSteps({ steps, current }) {
  return (
    <ol className="wizard-steps">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo'
        return (
          <li key={s} className={`wstep wstep-${state}`}>
            <span className="wstep-num">{i < current ? '✓' : i + 1}</span>
            <span className="wstep-label">{s}</span>
            {i < steps.length - 1 && <span className="wstep-line" />}
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------
// ProgressTimeline (수직 번호형 — Source Timeline / Evidence 생성근거)
// ---------------------------------------------------------------------
export function ProgressTimeline({ items, currentKey, compact }) {
  // items: [{key,label,desc}] 또는 ['문자열', ...]
  const norm = items.map((it, i) =>
    typeof it === 'string' ? { key: String(i), label: it } : it
  )
  const currentIdx = currentKey ? norm.findIndex((n) => n.key === currentKey) : norm.length
  return (
    <ol className={`timeline ${compact ? 'timeline-compact' : ''}`}>
      {norm.map((it, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo'
        return (
          <li key={it.key} className={`tl-item tl-${state}`}>
            <span className="tl-marker">{i < currentIdx ? '✓' : i + 1}</span>
            <div className="tl-content">
              <div className="tl-label">{it.label}</div>
              {it.desc && !compact && <div className="tl-desc">{it.desc}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------
// Toast (Mock 완료 알림)
// ---------------------------------------------------------------------
export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => onClose?.(), 3600)
    return () => clearTimeout(t)
  }, [toast, onClose])
  if (!toast) return null
  // 문자열 또는 { tone, text } 객체 모두 허용(객체를 raw 렌더하면 React 크래시 → 방어).
  const msg = (toast && typeof toast === 'object') ? (toast.text ?? '') : toast
  const tone = (toast && typeof toast === 'object') ? toast.tone : null
  const ToastIcon = (tone === 'danger' || tone === 'warning') ? AlertTriangle : CheckCircle2
  return (
    <div className={`toast ${tone ? `toast-${tone}` : ''}`}>
      <span className="toast-icon"><ToastIcon size={16} strokeWidth={2} /></span>
      <span className="toast-msg">{msg}</span>
      <button className="toast-close" onClick={onClose}>×</button>
    </div>
  )
}

// ---------------------------------------------------------------------
// SourceBadge (수집 출처)
// ---------------------------------------------------------------------
const SOURCE_META = {
  'SecurityScorecard API': { tone: 'primary', Ic: Link2 },
  'External Observation': { tone: 'indigo', Ic: Eye },
  'Partner Lab PoC': { tone: 'purple', Ic: FlaskConical },
  'Manual Review': { tone: 'warning', Ic: PenLine },
  // 구버전 호환
  'SSC API': { tone: 'primary', Ic: Link2 },
  'Browser Observation': { tone: 'indigo', Ic: Eye }
}
export function SourceBadge({ source }) {
  const m = SOURCE_META[source] || { tone: 'neutral', Ic: Circle }
  const Ic = m.Ic
  return (
    <span className={`badge badge-soft badge-${m.tone} source-badge`}>
      <Ic size={13} strokeWidth={2} />
      {source}
    </span>
  )
}

// 데이터 출처 / 성격 태그 (SSC Finding Data / Partner Lab PoC / General Advisory 등)
export function TagBadge({ tone = 'neutral', children }) {
  return <span className={`badge badge-soft badge-${tone}`}>{children}</span>
}

// ---------------------------------------------------------------------
// ImportProgressPanel (mock SSC sync — 단계별 진행)
// ---------------------------------------------------------------------
export function ImportProgressPanel({ stages, doneMessage, onComplete }) {
  const [active, setActive] = useState(0)
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (active >= stages.length) {
      setDone(true)
      onComplete?.()
      return
    }
    const t = setTimeout(() => setActive((a) => a + 1), 650)
    return () => clearTimeout(t)
  }, [active, stages.length, onComplete])
  return (
    <div className="import-panel">
      <div className="import-head">
        <span className={`import-spinner ${done ? 'done' : ''}`}>{done ? '✓' : '⟳'}</span>
        <b>{done ? 'Mock SSC Risk Import 완료' : 'Mock SSC Risk Import 진행 중…'}</b>
      </div>
      <ol className="import-stages">
        {stages.map((s, i) => {
          const state = i < active ? 'done' : i === active && !done ? 'run' : i < stages.length && done ? 'done' : 'todo'
          return (
            <li key={s} className={`imp-${state}`}>
              <span className="imp-mark">{state === 'done' ? '✓' : state === 'run' ? '⟳' : '○'}</span>
              {s}
            </li>
          )
        })}
      </ol>
      {done && <div className="import-done">{doneMessage}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------
// RegistrationSummaryCard
// ---------------------------------------------------------------------
export function RegistrationSummaryCard({ rows, accent = 'primary' }) {
  return (
    <div className={`reg-summary accent-${accent}`}>
      {rows.map((r) => (
        <div key={r.label} className="reg-row">
          <span className="reg-label">{r.label}</span>
          <span className="reg-value">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// 간단한 폼 필드 헬퍼
export function Field({ label, children, hint, required }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}
