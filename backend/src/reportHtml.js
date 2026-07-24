// 자립형(자산 임베드) 단일 HTML 리포트 생성기.
//  입력 데이터만으로 완전한 HTML 문자열을 만든다(백엔드 의존성 없음 · 순수 함수).
//  표지(등급 + 조치 우선순위 표) → 유형 클릭 시 해당 조치/증적 단일 뷰. 폰트·이미지는 라우트에서 data URI로 주입.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const SEV_KO = { high: '높음', medium: '보통', low: '낮음', info: '정보', critical: '심각' }
const sevColor = (s) => ({ critical: '#b91c1c', high: '#dc2626', medium: '#f59e0b', low: '#64748b', info: '#94a3b8' }[String(s).toLowerCase()] || '#64748b')
const gradeColor = (score) => score == null ? '#64748b' : score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626'

function imgOrPlaceholder(dataUri, label, variant) {
  if (dataUri) return `<figure class="shot"><img src="${dataUri}" alt="${esc(label)}"/><figcaption>${esc(label)}</figcaption></figure>`
  return `<figure class="shot shot-ph shot-${variant}"><div class="ph">증적 캡처<br/><span>${esc(label)}</span></div></figure>`
}

function diffTable(diff) {
  if (!Array.isArray(diff) || !diff.length) return ''
  const rows = diff.map((r) => `<tr class="${r.changed ? 'changed' : ''}"><td>${esc(r.key)}</td><td class="before">${esc(r.before)}</td><td class="after">${esc(r.after)}</td></tr>`).join('')
  return `<table class="diff"><thead><tr><th>관측 항목</th><th>조치 전</th><th>조치 후</th></tr></thead><tbody>${rows}</tbody></table>`
}

function labSection(it) {
  const ev = it.evidence || {}
  return `
    <div class="ba">
      ${imgOrPlaceholder(ev.beforeImg, ev.beforeLabel || '조치 전', 'before')}
      ${imgOrPlaceholder(ev.afterImg, ev.afterLabel || '조치 후', 'after')}
    </div>
    ${diffTable(ev.diff)}
    ${ev.tool ? `<p class="tool">확인 도구: <code>${esc(ev.tool)}</code></p>` : ''}
    <p class="note">파트너 표준 검증랩에서 <b>조치 전 → 조치 후</b>를 재현한 참고 증적입니다. 실제 해소 여부는 SecurityScorecard 재스캔으로 확인합니다.</p>`
}

function guideSection(it) {
  const g = it.guide || {}
  const steps = Array.isArray(g.steps) && g.steps.length
    ? `<ol class="steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''
  return `
    ${g.direction ? `<div class="block"><div class="block-t">조치 방향</div><p>${esc(g.direction)}</p></div>` : ''}
    ${steps ? `<div class="block"><div class="block-t">조치 단계</div>${steps}</div>` : ''}
    ${g.sscRec ? `<div class="block"><div class="block-t">SecurityScorecard 공식 권고</div><p>${esc(g.sscRec)}</p></div>` : ''}
    ${g.sscDesc ? `<div class="block"><div class="block-t">SSC 설명</div><p class="muted">${esc(g.sscDesc)}</p></div>` : ''}
    <p class="note">일반 구성 기준 조치 방향입니다. 운영 반영 전 고객 내부 검토·테스트가 필요하며, 해소 여부는 SecurityScorecard 재스캔으로 확인합니다.</p>`
}

function sectionHtml(it) {
  const sev = String(it.severity || '').toLowerCase()
  const kindBadge = it.kind === 'lab'
    ? '<span class="badge badge-lab">조치 전후 증거</span>'
    : '<span class="badge badge-guide">조치 가이드</span>'
  return `<section class="item" data-key="${esc(it.key)}">
    <button class="back" data-goto="__cover__">← 조치 우선순위로</button>
    <div class="item-head">
      <h2>${esc(it.name)}</h2>
      <div class="item-meta">
        <span class="badge" style="background:${sevColor(sev)}1a;color:${sevColor(sev)}">위험도 ${esc(SEV_KO[sev] || it.severity || '-')}</span>
        ${it.scoreImpact != null ? `<span class="badge badge-score">점수 개선 +${esc(it.scoreImpact)}</span>` : ''}
        ${kindBadge}
      </div>
    </div>
    ${it.kind === 'lab' ? labSection(it) : guideSection(it)}
  </section>`
}

function coverRows(items) {
  return items.map((it) => {
    const sev = String(it.severity || '').toLowerCase()
    const kind = it.kind === 'lab'
      ? '<span class="badge badge-lab">조치 전후 증거</span>'
      : '<span class="badge badge-guide">조치 가이드</span>'
    return `<tr data-goto="${esc(it.key)}">
      <td class="name">${esc(it.name)}</td>
      <td><span class="badge" style="background:${sevColor(sev)}1a;color:${sevColor(sev)}">${esc(SEV_KO[sev] || it.severity || '-')}</span></td>
      <td class="num">${it.scoreImpact != null ? '+' + esc(it.scoreImpact) : '-'}</td>
      <td>${kind}</td>
      <td class="go">보기 →</td>
    </tr>`
  }).join('')
}

export function buildReportHtml(d) {
  const items = d.items || []
  const gc = gradeColor(d.score)
  const fontFace = d.fontDataUri
    ? `@font-face{font-family:'Pretendard';src:url('${d.fontDataUri}') format('woff2');font-weight:100 900;font-display:swap;}`
    : ''
  const fontStack = `${d.fontDataUri ? "'Pretendard'," : ''}-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif`
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(d.customer)} · SecurityScorecard 보안 리스크 리포트</title>
<style>
${fontFace}
*{box-sizing:border-box}
body{margin:0;background:#f1f5f9;color:#0f172a;font-family:${fontStack};line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:0 auto;padding:24px 20px 64px}
.banner{background:linear-gradient(135deg,#0f2545,#1e3a63);color:#fff;border-radius:16px;padding:26px 28px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}
.banner .brand{font-size:12px;letter-spacing:.08em;font-weight:700;opacity:.8}
.banner h1{margin:6px 0 4px;font-size:24px}
.banner p{margin:0;opacity:.85;font-size:13px}
.banner code{background:rgba(255,255,255,.12);padding:1px 7px;border-radius:6px;font-size:12px}
.score{background:rgba(255,255,255,.1);border-radius:12px;padding:14px 20px;text-align:center;min-width:120px}
.score .lbl{font-size:11px;opacity:.8;display:block;margin-bottom:6px}
.score .val{font-size:34px;font-weight:800;line-height:1}
.score .grade{font-size:15px;font-weight:700;margin-left:6px;vertical-align:super}
.notice{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;margin:18px 0;font-size:13px;color:#92400e}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px 22px;margin-top:16px}
.card h3{margin:0 0 4px;font-size:16px}
.card .sub{margin:0 0 14px;color:#64748b;font-size:13px}
table.pri{width:100%;border-collapse:collapse;font-size:14px}
table.pri th{text-align:left;font-size:12px;color:#64748b;font-weight:600;padding:8px 10px;border-bottom:2px solid #e2e8f0}
table.pri td{padding:11px 10px;border-bottom:1px solid #eef2f7;vertical-align:middle}
table.pri tr[data-goto]{cursor:pointer}
table.pri tr[data-goto]:hover{background:#f8fafc}
table.pri td.name{font-weight:600}
table.pri td.num{font-variant-numeric:tabular-nums;color:#16a34a;font-weight:600}
table.pri td.go{color:#2563eb;font-weight:600;white-space:nowrap;text-align:right}
.badge{display:inline-block;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap}
.badge-lab{background:#ede9fe;color:#6d28d9}
.badge-guide{background:#f1f5f9;color:#475569}
.badge-score{background:#dcfce7;color:#15803d}
.item{display:none}
.item.active{display:block}
.item .back{background:none;border:none;color:#2563eb;font-size:13px;font-weight:600;cursor:pointer;padding:0;margin-bottom:10px}
.item-head{border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px}
.item-head h2{margin:0 0 8px;font-size:19px}
.item-meta{display:flex;gap:8px;flex-wrap:wrap}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:6px 0 16px}
.shot{margin:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#0b1220}
.shot img{display:block;width:100%;height:auto}
.shot figcaption{font-size:12px;color:#cbd5e1;padding:7px 10px;background:#0f172a}
.shot-ph .ph{color:#94a3b8;font-size:13px;text-align:center;padding:38px 12px;background:#f8fafc;border-radius:10px}
.shot-ph{background:#f8fafc}
.shot-ph .ph span{font-size:11px;color:#cbd5e1}
.shot-ph.shot-before .ph{border:1px dashed #fca5a5}
.shot-ph.shot-after .ph{border:1px dashed #86efac}
table.diff{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
table.diff th{text-align:left;font-size:11.5px;color:#64748b;padding:7px 10px;border-bottom:2px solid #e2e8f0}
table.diff td{padding:8px 10px;border-bottom:1px solid #eef2f7;font-family:ui-monospace,Menlo,Consolas,monospace}
table.diff td.before{color:#b91c1c}
table.diff td.after{color:#15803d}
table.diff tr.changed{background:#fafcff}
.tool{font-size:12px;color:#64748b}
.tool code,table.diff td{word-break:break-all}
.block{margin:0 0 14px}
.block-t{font-size:12px;font-weight:700;color:#334155;margin-bottom:4px}
.block p{margin:0}
.steps{margin:6px 0 0;padding-left:20px}
.steps li{margin:4px 0}
.muted{color:#64748b}
.note{font-size:12px;color:#64748b;border-left:3px solid #cbd5e1;padding:6px 12px;margin-top:14px;background:#f8fafc;border-radius:0 8px 8px 0}
.foot{margin-top:24px;font-size:11.5px;color:#94a3b8;text-align:center}
@media(max-width:640px){.ba{grid-template-columns:1fr}}
@media print{
  body{background:#fff}
  .wrap{max-width:100%;padding:0}
  table.pri td.go{display:none}
  .item{display:block !important;break-before:page}
  .item .back{display:none}
  tr[data-goto]{cursor:default}
}
</style>
</head>
<body>
<div class="wrap">
  <div class="banner">
    <div>
      <div class="brand">SSC 파트너 · 보안 리스크 리포트</div>
      <h1>${esc(d.customer)}</h1>
      <p>대상 도메인 <code>${esc(d.shownDomain || d.domain)}</code> · 발행일 ${esc(d.generatedAt)}</p>
    </div>
    <div class="score">
      <span class="lbl">SecurityScorecard 보안등급</span>
      <span class="val" style="color:${gc}">${d.score != null ? esc(d.score) : '—'}</span>
      ${d.grade ? `<span class="grade" style="color:${gc}">${esc(d.grade)}</span>` : ''}
    </div>
  </div>

  <div class="notice">파트너 표준 검증랩 증적은 귀사 운영환경의 조치 완료를 의미하지 않습니다. 실제 Finding 해소 여부는 SecurityScorecard 재스캔 또는 공식 검증 절차를 통해 확인해야 합니다.</div>

  <div id="cover" class="card">
    <h3>조치 우선순위</h3>
    <p class="sub">총 ${items.length}개 유형 · 위험도·점수 개선 순 · 유형을 클릭하면 조치/증적을 봅니다</p>
    ${items.length
      ? `<table class="pri"><thead><tr><th>문제 유형</th><th>위험도</th><th>점수 개선</th><th>전달 형태</th><th></th></tr></thead><tbody>${coverRows(items)}</tbody></table>`
      : '<p class="muted">수집된 SecurityScorecard 리스크가 없습니다.</p>'}
  </div>

  <div class="card" id="detail">
    ${items.map(sectionHtml).join('')}
  </div>

  <div class="foot">SecurityScorecard 기반 보안 리스크 리포트 · ${esc(d.customer)} · ${esc(d.generatedAt)}</div>
</div>
<script>
(function(){
  var cover=document.getElementById('cover'), detail=document.getElementById('detail');
  var items=Array.prototype.slice.call(document.querySelectorAll('.item'));
  function show(key){
    if(key==='__cover__'){ cover.style.display=''; detail.style.display='none'; items.forEach(function(s){s.classList.remove('active')}); window.scrollTo(0,0); return; }
    var found=false;
    items.forEach(function(s){ var on=s.getAttribute('data-key')===key; s.classList.toggle('active',on); if(on)found=true; });
    cover.style.display='none'; detail.style.display=found?'':'none'; window.scrollTo(0,0);
  }
  document.querySelectorAll('[data-goto]').forEach(function(el){ el.addEventListener('click',function(){ show(el.getAttribute('data-goto')); }); });
  show('__cover__');
})();
</script>
</body>
</html>`
}
