// =====================================================================
// ComplianceRef — 취약점의 '관련 컴플라이언스 (참고)' 칩 (공유 컴포넌트)
//  · 통제 영역 + 프레임워크(예시 조항). 제네릭(도메인/산업군 무관) 참고 표기.
//  · 조치 가이드 · 검증랩 증적 드로어(개요) · 리스크 점검 상세에서 동일하게 재사용 → 일관성.
//  · 산업군 필터·규제 관련(우선순위)은 고객 전달물 전용(여기선 안 함).
//  ⚠️ 조항 번호는 예시이며 감사 판정 아님 — 인증 범위·원문 대조 필요.
// =====================================================================
import React from 'react'
import { complianceRefFor, deliveryComplianceFor } from '../data/compliance.js'

export function ComplianceRef({ issueType, category }) {
  const ref = complianceRefFor(issueType, category)
  if (!ref?.frameworks?.length) return null
  return (
    <div className="compliance-ref">
      <div className="mini-title">관련 컴플라이언스 <span className="hint-text">(참고 · 감사 판정 아님)</span></div>
      <div style={{ fontSize: 13, marginBottom: 6 }}>통제 영역: <b>{ref.areas.join(' · ')}</b></div>
      <ul className="bullet" style={{ margin: 0 }}>
        {ref.frameworks.map((f) => (
          <li key={f.name}><span className="fw-tag">{f.name}</span> <span className="hint-text">{f.clause}</span></li>
        ))}
      </ul>
      <p className="hint-text" style={{ marginTop: 6 }}>고객 산업군별 규제 관련·우선순위는 고객 전달물에서 확인됩니다. 실제 조항·의무는 인증 범위와 원문 대조가 필요합니다.</p>
    </div>
  )
}

// 고객 전달물용 — 산업군 필터 + '규제 관련' 표시. industry = 고객사 산업군 문자열.
export function DeliveryCompliance({ issueType, category, industry }) {
  const d = deliveryComplianceFor(issueType, category, industry)
  if (!d?.frameworks?.length) return null
  const regTag = { fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-danger)', color: 'var(--text-danger)' }
  return (
    <div className="delivery-compliance">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="badge badge-soft badge-warning">관련성 참고 · 감사 판정 아님</span>
        {d.regulated && <span className="badge badge-soft badge-danger">규제 관련</span>}
      </div>
      <div style={{ fontSize: 13, margin: '6px 0' }}>귀사(<b>{d.bucket}</b>) 기준 · 통제 영역: <b>{d.areas.join(' · ')}</b></div>
      <ul className="bullet" style={{ margin: 0 }}>
        {d.frameworks.map((f) => (
          <li key={f.name}>
            {f.regulated ? <span style={regTag}>{f.name} · 규제</span> : <span className="fw-tag">{f.name}</span>} <span className="hint-text">{f.clause}</span>
          </li>
        ))}
      </ul>
      <p className="hint-text" style={{ marginTop: 6 }}>{d.regulated ? '특수 규제와 관련된 항목 — 심각도와 함께 우선 조치를 권장합니다.' : '일반 관련 항목입니다.'} 실제 조항·의무는 인증 범위와 원문 대조가 필요합니다.</p>
    </div>
  )
}
