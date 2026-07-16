// =====================================================================
// EngineRemediation — 고객 엔진별(nginx/apache/iis/app) 조치 스니펫 (엔진 탭)
//  검증랩 '조치 방법'과 조치 가이드가 '같은 조치'를 보여주도록 공유하는 컴포넌트.
//  · engineGuide(issueType).applies=false(dns/네트워크/인증서 유효기간 등)면 null 반환.
//  · run 은 { issueType, detectedProduct? } 만 있으면 됨(가이드는 detectedProduct 생략).
// =====================================================================
import React, { useState } from 'react'
import { engineGuide, engineHintFrom } from '../data/engineGuides.js'
import { CodeBlock } from './common.jsx'

export function ENGINE_LABEL(id) {
  return { nginx: 'NGINX', apache: 'Apache', iis: 'IIS', app: '애플리케이션' }[id] || id
}

export function EngineRemediation({ run }) {
  const guide = engineGuide(run.issueType)
  const hint = engineHintFrom(run.detectedProduct) // SSC product_name 기반(있을 때만)
  const [engineId, setEngineId] = useState(hint || 'nginx')
  if (!guide.applies) return null // DNS/네트워크/인증서 유효기간 등은 엔진 무관
  const cur = guide.engines.find((e) => e.id === engineId) || guide.engines[0]
  return (
    <>
      <div className="mini-title">고객 환경 적용 방법 (엔진별)</div>
      <p className="hint-text">
        {run.detectedProduct
          ? <>SSC 감지 제품: <b>{run.detectedProduct}</b> — 아래 탭에서 <b>{ENGINE_LABEL(hint)}</b>을(를) 추천 표시했습니다(추정, 확인 후 적용).</>
          : '고객 웹 엔진을 아래 탭에서 선택하세요. (SSC가 웹 엔진을 확정 제공하지 않아 수동 선택이 기본입니다.)'}
      </p>
      {guide.target && (
        <p className="hint-text">목표(엔진 무관): 응답 헤더 <code className="inline-code sm">{guide.target.header}: {guide.target.value}</code></p>
      )}
      <div className="engine-tabs">
        {guide.engines.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`engine-tab ${e.id === engineId ? 'active' : ''}`}
            onClick={() => setEngineId(e.id)}
          >
            {e.label}{hint === e.id && <span className="engine-hint-dot" title="SSC 감지(추정)">●</span>}
          </button>
        ))}
      </div>
      <CodeBlock lang={cur.lang} label={`${cur.label} · ${cur.file}`} filename={`remediation.${cur.lang === 'xml' ? 'config' : cur.lang}`} code={cur.snippet} />
      {guide.versionNote && <p className="hint-text">버전 주의: {guide.versionNote}</p>}
      <p className="hint-text">환경(버전·프록시·WAF·CDN)에 따라 적용 위치·문법이 다를 수 있습니다. 담당자가 서비스 영향 검토 후 적용하세요.</p>
    </>
  )
}
