// =====================================================================
// 랩 스튜디오 — SSC AI Lab Builder (관리자 전용)
//  흐름: 커버리지 현황 → 이슈 판정(classify) → 레시피 컴파일(Claude) →
//        게이트 검증 → 채택(immutable). Claude 는 레시피(데이터)만 만들고,
//        결정적 렌더러+게이트가 실제 환경·검증을 담당(운영 코드 자동수정 없음).
// =====================================================================
import React, { useState, useEffect } from 'react'
import {
  PageHeader, NoticeBox, PrimaryButton, SecondaryButton, StatCard,
  SectionTitle, TagBadge, Field, EmptyState, CodeBlock, Drawer
} from '../components/common.jsx'
import {
  fetchLabCoverage, classifyLabIssue, compileLabRecipe, gateLabRecipe, adoptLabRecipe,
  listLabRecipes, deleteLabRecipe, claudeKeyStatus, setClaudeKey, clearClaudeKey
} from '../lib/adminLabApi.js'
import { GuideSteps } from './Pages.jsx' // 조치법 뷰 재사용(조치 가이드와 동일 4단계)
import { guideRowMeta } from '../data/remediationSteps.js'
import { CheckCircle2, Wrench, FileText, Layers, XCircle } from 'lucide-react'

const VERDICT = {
  reuse: { ko: '재사용', tone: 'neutral', desc: '이미 지원되는 랩이 있습니다.' },
  auto_build: { ko: '자동 빌드', tone: 'success', desc: '제네릭 응답기로 레시피만으로 자동 재현 가능.' },
  extend: { ko: '확장 필요', tone: 'warning', desc: '검증 의미가 달라 전용 처리 필요(사람 확인).' },
  needs_infra: { ko: '신규 인프라', tone: 'warning', desc: '새 아키타입/collector 개발 필요(Phase 2).' },
  guide_only: { ko: '가이드 전용', tone: 'neutral', desc: '인프라 랩으로 재현 불가.' }
}

function ClaudeKeyCard() {
  const [status, setStatus] = useState(null)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = () => claudeKeyStatus().then(setStatus).catch(() => setStatus({ configured: false }))
  useEffect(() => { load() }, [])
  const save = async () => {
    setBusy(true); setErr('')
    try { setStatus(await setClaudeKey(val)); setVal('') } catch (e) { setErr(e?.payload?.message || e.message) } finally { setBusy(false) }
  }
  const clear = async () => { setBusy(true); try { setStatus(await clearClaudeKey()) } finally { setBusy(false) } }
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <SectionTitle kicker="AI Recipe Compiler" title="Claude API 키" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        {status?.configured
          ? <TagBadge tone="success">설정됨 · {status.hint} ({status.source})</TagBadge>
          : <TagBadge tone="danger">미설정</TagBadge>}
        <input type="password" placeholder="sk-ant-..." value={val} onChange={(e) => setVal(e.target.value)} style={{ flex: 1, minWidth: 220, padding: '8px 10px', border: '1px solid var(--border, #d1d5db)', borderRadius: 8 }} />
        <PrimaryButton onClick={save} disabled={busy || !val.trim()}>저장</PrimaryButton>
        {status?.configured && status.source === 'db' && <SecondaryButton onClick={clear} disabled={busy}>해제</SecondaryButton>}
      </div>
      {err && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ color: 'var(--muted, #6b7280)', fontSize: 12, marginTop: 8 }}>
        <b>권장: 운영 환경에서는 backend/.env 의 ANTHROPIC_API_KEY 로 설정</b>(브라우저·DB·git 을 거치지 않음).
        UI 저장은 AES-GCM 암호화되지만 KEK 근원인 AUTH_ACCESS_SECRET 가 기본값이면 저장이 차단됩니다.
        어느 경우든 응답·로그에 키 원문은 노출되지 않습니다.
      </div>
    </div>
  )
}

function RecipePanel({ recipe, onGate, onAdopt, gate, busy }) {
  if (!recipe) return null
  const vs = recipe.verificationSemantics || {}
  const passed = gate?.passed
  return (
    <div className="card" style={{ padding: 16, marginTop: 12, borderLeft: '3px solid var(--primary, #2563eb)' }}>
      <SectionTitle kicker={`레시피 ${recipe.id || ''} · ${recipe.status}`} title={recipe.catalog?.koName || recipe.issueType} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted,#6b7280)' }}>검증 의미(verificationSemantics)</div>
          <CodeBlock lang="json" code={JSON.stringify(vs, null, 2)} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted,#6b7280)' }}>소스 diff(레시피)</div>
          <CodeBlock lang="nginx" code={`- ${recipe.sourceDiff?.inline?.before || ''}\n+ ${recipe.sourceDiff?.inline?.after || ''}`} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--muted,#6b7280)' }}>조치 방향</div>
        <div style={{ fontSize: 14 }}>{recipe.guide?.direction}</div>
      </div>
      {gate && (
        <div style={{ marginTop: 12 }}>
          <NoticeBox tone={passed ? 'success' : 'danger'} title={passed ? '게이트 통과 (채택 가능)' : `게이트 미통과 (fail ${gate.failCount})`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {(gate.checks || []).map((c) => (
                <TagBadge key={c.id} tone={c.status === 'pass' ? 'success' : c.status === 'warn' ? 'warning' : 'danger'}>{c.id}</TagBadge>
              ))}
            </div>
          </NoticeBox>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <PrimaryButton onClick={onGate} disabled={busy}>게이트 실행</PrimaryButton>
        <SecondaryButton onClick={onAdopt} disabled={busy || !passed}>채택(active)</SecondaryButton>
      </div>
    </div>
  )
}

export function LabStudio() {
  const [status, setStatus] = useState('loading')
  const [cov, setCov] = useState(null)
  const [search, setSearch] = useState('')
  const [bucket, setBucket] = useState('toBuild')
  const [selected, setSelected] = useState(null) // { issue, classification }
  const [recipe, setRecipe] = useState(null)
  const [gate, setGate] = useState(null)
  const [recipes, setRecipes] = useState([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [guideFor, setGuideFor] = useState(null) // 커버리지 행의 조치법 드로어 (전 유형 조치 참고)

  const reloadRecipes = () => listLabRecipes().then(setRecipes).catch(() => {})
  useEffect(() => {
    fetchLabCoverage()
      .then((d) => { setCov(d); setStatus('ok') })
      .catch((e) => setStatus(e?.status === 403 ? 'forbidden' : 'error'))
    reloadRecipes()
  }, [])

  if (status === 'forbidden') return <div className="page"><PageHeader title="랩 스튜디오" /><NoticeBox tone="danger" title="권한 없음">관리자만 접근할 수 있습니다.</NoticeBox></div>
  if (status === 'loading') return <div className="page"><PageHeader title="랩 스튜디오" /><div>불러오는 중…</div></div>
  if (status === 'error') return <div className="page"><PageHeader title="랩 스튜디오" /><NoticeBox tone="danger" title="오류">커버리지 조회에 실패했습니다(SSC 토큰 확인).</NoticeBox></div>

  // 커버리지 → 표 행(버킷별)
  const rowsFor = (b) => {
    if (b === 'toBuild') return Object.entries(cov.toBuild || {}).flatMap(([fam, arr]) => arr.map((e) => ({ ...e, bucket: `to-build/${fam}` })))
    if (b === 'supported') return (cov.supported || []).map((e) => ({ ...e, bucket: 'supported' }))
    if (b === 'guideOnly') return (cov.guideOnly || []).map((e) => ({ ...e, bucket: 'guide-only' }))
    return []
  }
  const q = search.trim().toLowerCase()
  const rows = rowsFor(bucket).filter((e) => !q || (e.key + ' ' + (e.title || '')).toLowerCase().includes(q)).slice(0, 120)

  const doClassify = async (issueType) => {
    setBusy('classify'); setErr(''); setRecipe(null); setGate(null)
    try { const r = await classifyLabIssue(issueType); setSelected({ issue: r.issue, classification: r.classification }) } catch (e) { setErr(e?.payload?.message || e.message) } finally { setBusy('') }
  }
  const doCompile = async () => {
    setBusy('compile'); setErr(''); setGate(null)
    try { const r = await compileLabRecipe(selected.issue.key); setRecipe(r.recipe); reloadRecipes() } catch (e) { setErr(`컴파일 실패: ${e?.payload?.message || e.message} ${e?.payload?.errors ? '(' + e.payload.errors.join('; ') + ')' : ''}`) } finally { setBusy('') }
  }
  const doGate = async () => {
    setBusy('gate'); setErr('')
    try { const r = await gateLabRecipe(recipe.id); setGate(r.gate); reloadRecipes() } catch (e) { setErr(e?.payload?.message || e.message) } finally { setBusy('') }
  }
  const doAdopt = async () => {
    setBusy('adopt'); setErr('')
    try { await adoptLabRecipe(recipe.id); await reloadRecipes(); setRecipe({ ...recipe, status: 'active' }); const d = await fetchLabCoverage(); setCov(d) } catch (e) { setErr(e?.payload?.message || e.message) } finally { setBusy('') }
  }
  const removeRecipe = async (id) => { await deleteLabRecipe(id); reloadRecipes() }

  const c = cov.counts || {}
  const v = selected && VERDICT[selected.classification?.verdict]
  const compilable = selected && ['auto_build', 'extend'].includes(selected.classification?.verdict)

  return (
    <div className="page">
      <PageHeader title="랩 스튜디오 — SSC AI Lab Builder" desc="SSC 이슈를 판정하고, Claude가 레시피(데이터)를 컴파일하면 결정적 렌더러와 게이트가 실제 랩을 재현·검증합니다. 운영 코드는 자동 변경되지 않습니다." />

      <ClaudeKeyCard />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon={<CheckCircle2 size={19} />} label="지원(랩 있음)" value={c.supported} tone="success" />
        <StatCard icon={<Wrench size={19} />} label="재현가능·미구축" value={c.toBuild} tone="primary" />
        <StatCard icon={<FileText size={19} />} label="가이드 전용" value={c.guideOnly} />
        <StatCard icon={<Layers size={19} />} label={`SSC 전체`} value={cov.sscTotal} />
      </div>

      <div className="card" style={{ padding: 16 }}>
        <SectionTitle kicker="커버리지 현황" title="SSC issue_type 대조" />
        <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
          {['toBuild', 'supported', 'guideOnly'].map((b) => (
            <button key={b} onClick={() => setBucket(b)} className={'btn ' + (bucket === b ? 'btn-primary' : 'btn-secondary')} style={{ padding: '4px 12px' }}>
              {b === 'toBuild' ? '재현가능·미구축' : b === 'supported' ? '지원됨' : '가이드 전용'} ({b === 'toBuild' ? c.toBuild : b === 'supported' ? c.supported : c.guideOnly})
            </button>
          ))}
          <input placeholder="issue_type / 제목 검색" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200, padding: '6px 10px', border: '1px solid var(--border,#d1d5db)', borderRadius: 8 }} />
        </div>
        {rows.length === 0
          ? <EmptyState title="해당 항목 없음" desc={bucket === 'toBuild' ? '재현 가능한 미구축 이슈가 없습니다(현재 커버리지 완비).' : '검색 결과가 없습니다.'} />
          : (
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8 }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead><tr><th>issue_type</th><th>제목</th><th>factor</th><th>심각도</th><th></th></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.key}>
                      <td><code className="inline-code sm">{e.key}</code></td>
                      <td style={{ fontSize: 13 }}>{e.title}</td>
                      <td style={{ fontSize: 12 }}>{e.factor}</td>
                      <td style={{ fontSize: 12 }}>{e.severity}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <SecondaryButton onClick={() => setGuideFor(guideRowMeta(e.key))}>조치법</SecondaryButton>{' '}
                        <SecondaryButton onClick={() => doClassify(e.key)} disabled={busy === 'classify'}>판정</SecondaryButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {err && <NoticeBox tone="danger" title="오류">{err}</NoticeBox>}

      {selected && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <SectionTitle kicker={`판정 대상 · ${selected.issue.key}`} title={selected.issue.title || selected.issue.key} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <TagBadge tone={v?.tone || 'neutral'}>{v?.ko || selected.classification?.verdict}</TagBadge>
            <span style={{ fontSize: 13, color: 'var(--muted,#6b7280)' }}>{selected.classification?.reason}</span>
          </div>
          {selected.classification?.similar?.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 6 }}>유사 랩: {selected.classification.similar.map((s) => <code key={s} className="inline-code sm" style={{ marginRight: 4 }}>{s}</code>)}</div>
          )}
          {compilable
            ? <div style={{ marginTop: 12 }}><PrimaryButton onClick={doCompile} disabled={busy === 'compile'}>{busy === 'compile' ? 'Claude 컴파일 중…' : '레시피 컴파일 (Claude)'}</PrimaryButton></div>
            : <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted,#6b7280)' }}>이 판정은 레시피 자동 컴파일 대상이 아닙니다.</div>}

          <RecipePanel recipe={recipe} gate={gate} busy={!!busy} onGate={doGate} onAdopt={doAdopt} />
        </div>
      )}

      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <SectionTitle kicker="레시피 레지스트리" title={`저장된 레시피 (${recipes.length})`} />
        {recipes.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--muted,#6b7280)', marginTop: 6 }}>아직 컴파일된 레시피가 없습니다.</div>
          : (
            <table className="data-table" style={{ width: '100%', marginTop: 8 }}>
              <thead><tr><th>id</th><th>issue_type</th><th>상태</th><th>게이트</th><th>생성</th><th></th></tr></thead>
              <tbody>
                {recipes.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12 }}>{r.id}</td>
                    <td><code className="inline-code sm">{r.issueType}</code></td>
                    <td><TagBadge tone={r.status === 'active' ? 'success' : r.status === 'archived' ? 'neutral' : 'warning'}>{r.status}</TagBadge></td>
                    <td style={{ fontSize: 12 }}>{r.gate ? (r.gate.passed ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-success,#16a34a)' }}><CheckCircle2 size={13} /> 통과</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-danger,#dc2626)' }}><XCircle size={13} /> 실패 {r.gate.failCount}</span>) : '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.generator?.model || '—'}</td>
                    <td><SecondaryButton onClick={() => removeRecipe(r.id)}>삭제</SecondaryButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {guideFor && (
        <Drawer
          title={guideFor.name}
          subtitle={`${guideFor.displayName} · ${guideFor.key}`}
          onClose={() => setGuideFor(null)}
          footer={<SecondaryButton onClick={() => setGuideFor(null)}>닫기</SecondaryButton>}
          width="md"
        >
          <GuideSteps detail={guideFor} />
        </Drawer>
      )}
    </div>
  )
}
