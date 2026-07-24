// =====================================================================
// 로그인 화면 — 인트로(라인아트 self-drawing → 페이드 → 히어로 텍스트) → 클릭 → 로그인
//  - 게시 링크 #share 는 이 게이트를 우회.
// =====================================================================
import React, { useState } from 'react'
import { login } from '../lib/auth.js'
import { PrimaryButton, NoticeBox } from '../components/common.jsx'
import { BrandMark } from '../components/BrandMark.jsx'

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

          {/* 개발 빌드에서만 노출 — 배포본에 기본 계정을 광고하지 않는다 */}
          {import.meta.env.DEV && (
            <p className="login-hint">데모 계정: <code className="inline-code sm">admin@ssc.local</code> / <code className="inline-code sm">ssc-demo-1234</code></p>
          )}
        </form>
      )}
    </div>
  )
}
