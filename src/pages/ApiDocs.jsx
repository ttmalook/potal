import { useEffect, useState } from 'react'
import { call } from '../lib/apiCall.js'

// 관리자 전용 API 문서 — 백엔드 OpenAPI 스펙(admin 게이팅)을 Swagger UI 로 렌더.
//  무거운 swagger-ui-react 는 이 페이지에서만 동적 로드(메인 번들 비대화 방지).
export function ApiDocs() {
  const [Ui, setUi] = useState(null)
  const [spec, setSpec] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      import('swagger-ui-react'),
      import('swagger-ui-react/swagger-ui.css'),
      call('/api/admin/openapi.json')
    ])
      .then(([mod, , s]) => { if (alive) { setUi(() => mod.default); setSpec(s) } })
      .catch((e) => { if (alive) setErr(e?.payload?.message || e.message || '스펙을 불러오지 못했습니다') })
    return () => { alive = false }
  }, [])

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>API 문서</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary,#6b7280)', fontSize: 13 }}>
          백엔드 REST API 명세 (OpenAPI 3.0 · 관리자 전용) — 개발자 인수인계·연동 참고용.
        </p>
      </div>
      {err && (
        <div className="notice notice-danger" style={{ padding: 14 }}>
          API 문서를 불러오지 못했습니다: {err}
        </div>
      )}
      {!err && (!Ui || !spec) && (
        <div style={{ padding: 24, color: 'var(--text-secondary,#6b7280)' }}>API 문서 로딩 중…</div>
      )}
      {Ui && spec && <div className="api-docs"><Ui spec={spec} /></div>}
    </div>
  )
}
