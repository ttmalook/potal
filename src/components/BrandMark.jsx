import React from 'react'

// 포털 브랜드마크 — 로그인 인트로/사이드바 공용 (지구본 와이어프레임 + 전구)
export function BrandMark({ size = 76, className = '' }) {
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

export default BrandMark
