// =====================================================================
// 로그인 화면 — 인트로(라인아트 self-drawing → 페이드 → 히어로 텍스트) → 클릭 → 로그인
//  - 게시 링크 #share 는 이 게이트를 우회.
// =====================================================================
import React, { useState } from 'react'
import { login } from '../lib/auth.js'
import { PrimaryButton, NoticeBox } from '../components/common.jsx'

// 브랜드 마크 — 걷는 글로브 + 전구(아이디어) 라인아트.
// 참고 스타일을 오리지널로 재현, 색은 CSS(.bm-line)에서 기존 팔레트(네이비)로 제어.
function BrandMark({ size = 76, className = '' }) {
  return (
    <svg className={`brand-mark ${className}`} width={size} height={size * 92 / 96} viewBox="0 0 96 92" fill="none" aria-hidden="true">
      <g className="bm-line">
        {/* 글로브 와이어프레임 */}
        <circle cx="36" cy="44" r="26" />
        <line x1="36" y1="18" x2="36" y2="70" />
        <line x1="10" y1="44" x2="62" y2="44" />
        <ellipse cx="36" cy="44" rx="11" ry="26" />
        <ellipse cx="36" cy="44" rx="26" ry="11" />
        {/* 걷는 다리 */}
        <path d="M30 69 L26 82 L21 82" />
        <path d="M42 69 L46 80 L51 80" />
        {/* 팔 → 전구 */}
        <path d="M59 38 Q69 31 71.5 24" />
        <circle cx="77" cy="16" r="7" />
        <path d="M73.5 23 L80.5 23 M74.5 25.5 L79.5 25.5" />
        <path className="bm-spark" d="M77 6 V2 M83.5 10.5 L87 7 M70.5 10.5 L67 7" />
      </g>
    </svg>
  )
}

export default function LoginView({ onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [entered, setEntered] = useState(false) // false=인트로/히어로, true=로그인 폼

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const user = await login(email.trim(), password)
      onSuccess?.(user)
    } catch (err) {
      setError(err?.payload?.message || err?.message || '로그인에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <div className={`login-shell ${entered ? 'entered' : 'intro'}`}>
      {/* 인트로: 라인아트가 그려졌다가 사라짐 (stroke-dashoffset → fade) */}
      <svg className="login-bg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {/* 실선: stroke-dashoffset 으로 그려지는 링 */}
        <circle className="lb-line d0" cx="400" cy="300" r="120" />
        <circle className="lb-line d1" cx="400" cy="300" r="152" />
        {/* 점선: 점선 패턴으로 페이드인 + 흐르는 링 */}
        <circle className="lb-dash k0" cx="368" cy="316" r="120" />
        <circle className="lb-dash k1" cx="432" cy="284" r="120" />
        <circle className="lb-dash k2 inner" cx="400" cy="300" r="70" />
        <circle className="lb-orbit o1" cx="400" cy="148" r="4.5" />
        <circle className="lb-orbit o2" cx="400" cy="452" r="5.5" />
      </svg>

      {!entered ? (
        <button type="button" className="login-hero" onClick={() => setEntered(true)}>
          <span className="login-lockup">
            <BrandMark size={84} className="login-mark" />
            <span className="login-wordmark">
              <span className="login-hero-title">SSC</span>
              <span className="login-hero-name">Partner Portal</span>
            </span>
          </span>
          <span className="login-hero-hint">클릭하여 로그인 →</span>
        </button>
      ) : (
        <form className="login-card" onSubmit={submit}>
          <div className="login-brand">
            <BrandMark size={40} className="brand-mark-card" />
            <div>
              <div className="login-title">SSC Partner Portal</div>
              <div className="login-sub">보안 리스크 점검 · 검증</div>
            </div>
          </div>

          <label className="field">
            <span className="field-label">이메일</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoFocus />
          </label>
          <label className="field">
            <span className="field-label">비밀번호</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" />
          </label>

          {error && <NoticeBox tone="danger">{error}</NoticeBox>}

          <PrimaryButton type="submit" disabled={busy || !email || !password} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? '로그인 중…' : '로그인'}
          </PrimaryButton>

          <p className="login-hint">데모 계정: <code className="inline-code sm">admin@ssc.local</code> / <code className="inline-code sm">ssc-demo-1234</code></p>
        </form>
      )}
    </div>
  )
}
