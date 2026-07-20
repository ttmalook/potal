// =====================================================================
// Customer Registration Wizard + Domain 등록 Modal
// 전부 mock — 실제 API/DB 저장 없음. local state로 목록에 임시 추가.
// =====================================================================
import React, { useState } from 'react'
import * as data from '../data/mock.js'
import { parseEndpoint, endpointConflicts } from '../lib/domainScope.js'
import { apiChangeMyPassword } from '../lib/portalApi.js'
import {
  Modal,
  Field,
  PrimaryButton,
  SecondaryButton,
  NoticeBox,
  ImportProgressPanel
} from '../components/common.jsx'

const EMPTY = {
  name: '',
  industry: data.wizardOptions.industries[0],
  contract: 'Active',
  contactName: '', // 고객담당자(고객 측 담당자 이름)
  contact: '',     // 고객 담당자 이메일
  note: ''
}

export function CustomerWizard({ onClose, onRegister, showToast, persisted = false }) {
  const [form, setForm] = useState(EMPTY)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const canSave = form.name.trim() && form.contact.trim()

  const submit = () => {
    const newCustomer = {
      id: 'CUST-' + String(900 + Math.floor((form.name.length * 7) % 99)),
      name: form.name.trim(),
      industry: form.industry,
      domains: 0,
      openRisks: 0,
      lastCheck: '—',
      contactName: form.contactName.trim() || '—', // 고객담당자
      status: form.contract,
      contact: form.contact.trim() || '—',          // 고객 담당자 이메일
      note: form.note.trim(),
      isNew: true
    }
    onRegister?.(newCustomer)
    showToast?.(`${persisted ? '등록 저장 완료' : 'Mock 등록(미저장)'} — ${newCustomer.name}`)
    onClose?.()
  }

  const footer = (
    <>
      <SecondaryButton onClick={onClose}>취소</SecondaryButton>
      <PrimaryButton onClick={submit} disabled={!canSave}>등록</PrimaryButton>
    </>
  )

  return (
    <Modal title="신규 고객사 등록" subtitle="고객사 기본 정보 · 등록 후 [도메인·점검 범위]에서 도메인을 추가하세요" onClose={onClose} footer={footer} size="md">
      <div className="modal-form">
        <Field label="고객사명" required>
          <input value={form.name} onChange={set('name')} placeholder="예: Sample Tech Co." autoFocus />
        </Field>
        <Field label="산업군">
          <select value={form.industry} onChange={set('industry')}>
            {data.wizardOptions.industries.map((i) => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="계약 상태">
          <select value={form.contract} onChange={set('contract')}>
            {data.wizardOptions.contractStatuses.map((i) => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="고객담당자">
          <input value={form.contactName} onChange={set('contactName')} placeholder="예: 홍길동 (고객 측 담당자)" />
        </Field>
        <Field label="고객 담당자 이메일" required>
          <input value={form.contact} onChange={set('contact')} placeholder="security@customer.example" />
        </Field>
        <Field label="메모" hint="선택 입력">
          <input value={form.note} onChange={set('note')} placeholder="점검 관련 메모" />
        </Field>
      </div>
      {!persisted && (
        <NoticeBox tone="warning" title="Backend 미연결 — 저장 안 됨">
          현재 저장 백엔드에 연결되어 있지 않아 화면(메모리)에만 반영되고 새로고침 시 사라집니다.
        </NoticeBox>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------
// 다중 URL 편집기 (허용/제외 URL을 여러 개 추가/삭제/수정)
// ---------------------------------------------------------------------
function UrlListEditor({ label, values, onChange, placeholder, addLabel = '+ URL 추가' }) {
  const setAt = (i, v) => { const next = [...values]; next[i] = v; onChange(next) }
  const add = () => onChange([...values, ''])
  const removeAt = (i) => onChange(values.length > 1 ? values.filter((_, idx) => idx !== i) : [''])
  return (
    <div className="url-editor">
      <div className="field-label">{label}</div>
      {values.map((v, i) => (
        <div className="url-row" key={i}>
          <input value={v} onChange={(e) => setAt(i, e.target.value)} placeholder={placeholder} />
          <button type="button" className="url-remove" onClick={() => removeAt(i)} title="삭제">×</button>
        </div>
      ))}
      <button type="button" className="url-add" onClick={add}>{addLabel}</button>
    </div>
  )
}

// ---------------------------------------------------------------------
// Domain 등록/수정 Modal (다중 URL 지원)
// ---------------------------------------------------------------------
export function DomainModal({ onClose, onSubmit, showToast, customers = data.customers, existingDomains = data.domains, initialCustomer = null, mode = 'create', initial = null }) {
  const list = customers && customers.length ? customers : data.customers
  const isEdit = mode === 'edit'
  const [customer, setCustomer] = useState(() => {
    const pre = initial?.customer || (typeof initialCustomer === 'string' ? initialCustomer : '')
    return pre || list[0]?.name || ''
  })
  // 등록(create): 서비스 주소 여러 개 / 수정(edit): 단일 주소
  const [addresses, setAddresses] = useState(
    isEdit ? [initial?.rawDomainInput || initial?.serviceEndpoint || initial?.primary || ''] : ['']
  )
  const clean = addresses.map((s) => s.trim()).filter(Boolean)

  // 서비스 주소 → 도메인 행. 허용범위·접속URL은 기본값 자동(세부는 검증랩에서).
  const buildRow = (addr, existingId) => {
    const p = parseEndpoint(addr.trim())
    const accessUrl = p.accessUrl
    return {
      id: existingId || 'DOM-' + p.serviceEndpoint.replace(/[^a-z0-9]/gi, '').slice(0, 24),
      customer,
      primary: p.serviceEndpoint,
      rawDomainInput: p.rawDomainInput,
      host: p.host,
      port: p.port,
      serviceEndpoint: p.serviceEndpoint,
      accessUrl,
      sscLookupDomain: p.sscLookupDomain,
      baseUrl: accessUrl,
      allow: [accessUrl + '/*'], // 기본 점검 범위
      deny: [],
      screenshot: true,
      har: false,
      consent: initial?.consent || '검토 중',
      status: isEdit ? (initial.status || 'SSC Import 대기') : 'SSC Import 대기',
      isNew: isEdit ? initial.isNew : true
    }
  }

  const submit = () => {
    if (isEdit) {
      const row = buildRow(clean[0], initial.id)
      onSubmit?.(row, 'edit')
      showToast?.(`도메인 수정 완료 — ${row.serviceEndpoint}`)
      onClose?.()
      return
    }
    // 각 주소를 개별 도메인 행으로 등록. 동일 고객사 내 중복 서비스 주소는 제외.
    let added = 0, dup = 0
    const seen = new Set()
    for (const addr of clean) {
      const p = parseEndpoint(addr)
      if (seen.has(p.serviceEndpoint)) { dup++; continue }
      seen.add(p.serviceEndpoint)
      if (endpointConflicts(existingDomains || [], customer, p).exactDup) { dup++; continue }
      onSubmit?.(buildRow(addr), 'create')
      added++
    }
    showToast?.(`도메인 등록 완료 — ${added}건${dup ? ` (중복 ${dup}건 제외)` : ''}`)
    onClose?.()
  }

  const footer = (
    <>
      <SecondaryButton onClick={onClose}>취소</SecondaryButton>
      <PrimaryButton onClick={submit} disabled={!clean.length}>{isEdit ? '변경 저장' : '도메인 등록'}</PrimaryButton>
    </>
  )
  return (
    <Modal
      title={isEdit ? '도메인 수정' : '도메인 등록'}
      subtitle={isEdit ? '서비스 주소를 수정합니다.' : '고객사의 서비스 주소를 여러 개 등록할 수 있습니다. 등록 후 SSC Risk Import 대기 상태가 됩니다.'}
      onClose={onClose}
      footer={footer}
      size="md"
    >
      <div className="modal-form">
        <Field label="고객사 선택" required>
          <select value={customer} onChange={(e) => setCustomer(e.target.value)} disabled={isEdit}>
            {list.map((c) => <option key={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {isEdit ? (
          <Field label="점검 대상 서비스 주소" required hint="도메인만 또는 도메인:포트 (예: example.com · example.com:8443)">
            <input value={addresses[0]} onChange={(e) => setAddresses([e.target.value])} placeholder="example.com 또는 example.com:8443" autoFocus />
          </Field>
        ) : (
          <UrlListEditor
            label="점검 대상 서비스 주소 (여러 개 가능)"
            values={addresses}
            onChange={setAddresses}
            placeholder="example.com 또는 example.com:8443"
            addLabel="+ 서비스 주소 추가"
          />
        )}
      </div>

      {isEdit && clean[0] && (
        <div className="kv compact endpoint-preview">
          <div><span>서비스 주소</span><b>{parseEndpoint(clean[0]).serviceEndpoint || '—'}</b></div>
          <div><span>SSC 조회 기준</span><b>{parseEndpoint(clean[0]).sscLookupDomain || '—'}</b></div>
          {parseEndpoint(clean[0]).port && <div><span>포트 보존</span><b className="ok">:{parseEndpoint(clean[0]).port} 유지됨</b></div>}
        </div>
      )}

      <NoticeBox tone="info">
        SSC 위험 수집은 <b>등록된 서비스 주소(도메인)</b>에 대해서만 수행되며, 조회 전 백엔드가 SSC 스코프를 확인합니다.
        세부 점검 범위(허용/제외 URL)·능동 검증은 <b>[검증랩]</b>에서 다룹니다.
      </NoticeBox>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// Customer 수정 Modal (회사 정보)
// ---------------------------------------------------------------------
export function CustomerEditModal({ customer, onClose, onSubmit, showToast }) {
  const [form, setForm] = useState({
    name: customer.name,
    industry: customer.industry,
    contract: customer.status,
    engineer: customer.engineer,
    contact: customer.contact,
    note: customer.note || ''
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    onSubmit?.(customer.id, {
      name: form.name.trim() || customer.name,
      industry: form.industry,
      status: form.contract,
      engineer: form.engineer,
      contact: form.contact.trim(),
      note: form.note.trim()
    })
    showToast?.(`Mock 고객 정보 수정 완료 — ${form.name.trim() || customer.name}`)
    onClose?.()
  }
  const footer = (
    <>
      <SecondaryButton onClick={onClose}>취소</SecondaryButton>
      <PrimaryButton onClick={submit} disabled={!form.name.trim()}>변경 저장</PrimaryButton>
    </>
  )
  return (
    <Modal title="고객사 수정" subtitle={`${customer.id} · 회사 정보 수정 (도메인은 Domains & Scope에서 관리)`} onClose={onClose} footer={footer}>
      <div className="form-grid">
        <Field label="고객사명" required><input value={form.name} onChange={set('name')} /></Field>
        <Field label="산업군">
          <select value={form.industry} onChange={set('industry')}>
            {data.wizardOptions.industries.map((i) => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="계약 상태">
          <select value={form.contract} onChange={set('contract')}>
            {data.wizardOptions.contractStatuses.map((i) => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="담당 파트너 엔지니어">
          <select value={form.engineer} onChange={set('engineer')}>
            {data.wizardOptions.engineers.map((i) => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="고객 보안 담당자 이메일"><input value={form.contact} onChange={set('contact')} /></Field>
        <Field label="메모"><input value={form.note} onChange={set('note')} /></Field>
      </div>
    </Modal>
  )
}

// =====================================================================
// 본인 비밀번호 변경 — 현재 비밀번호 검증 필수.
//  변경에 성공하면 서버가 모든 세션을 폐기하므로 재로그인해야 한다.
// =====================================================================
export function ChangePasswordModal({ onClose, onDone, showToast }) {
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const tooShort = pw.length > 0 && pw.length < 8
  const mismatch = pw2.length > 0 && pw !== pw2
  const same = pw.length > 0 && cur === pw
  const canSubmit = cur.length > 0 && pw.length >= 8 && pw === pw2 && !same && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setErr('')
    try {
      await apiChangeMyPassword(cur, pw)
      showToast?.({ tone: 'success', text: '비밀번호가 변경되었습니다 — 다시 로그인해 주세요' })
      onClose?.()
      onDone?.()          // 세션이 폐기되었으므로 로그아웃 처리
    } catch (e) {
      setErr(e?.payload?.message || '변경에 실패했습니다.')
    } finally { setBusy(false) }
  }

  return (
    <Modal title="비밀번호 변경" subtitle="변경 후 다시 로그인해야 합니다" onClose={onClose} size="sm"
      footer={<>
        <SecondaryButton onClick={onClose}>취소</SecondaryButton>
        <PrimaryButton onClick={submit} disabled={!canSubmit}>{busy ? '변경 중…' : '변경'}</PrimaryButton>
      </>}>
      <div className="modal-form">
        <Field label="현재 비밀번호" required>
          <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="현재 비밀번호" />
        </Field>
        <Field label="새 비밀번호" required hint="8자 이상">
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호" />
        </Field>
        <Field label="새 비밀번호 확인" required>
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="한 번 더 입력" />
        </Field>
      </div>
      {tooShort && <NoticeBox tone="warning">새 비밀번호는 8자 이상이어야 합니다.</NoticeBox>}
      {mismatch && <NoticeBox tone="warning">두 입력이 일치하지 않습니다.</NoticeBox>}
      {same && <NoticeBox tone="warning">현재 비밀번호와 다른 값을 사용하세요.</NoticeBox>}
      {err && <NoticeBox tone="danger">{err}</NoticeBox>}
      <p className="hint-text" style={{ marginTop: 10 }}>
        변경하면 <b>모든 기기의 세션이 로그아웃</b>되며, 감사 로그에 기록됩니다(비밀번호 값은 기록되지 않음).
      </p>
    </Modal>
  )
}
