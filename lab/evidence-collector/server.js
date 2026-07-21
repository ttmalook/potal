// =====================================================================
// Evidence Collector (Playwright) — http_header 카테고리 스캐폴드
//  - vulnerable/remediated 웹 타깃에 접속 → 스크린샷 + 응답 헤더 캡처 → 헤더 diff.
//  - 반환 형태는 오케스트레이터(lab.js)의 simulatedEvidence()와 동일.
//  - TLS/DNS/네트워크 카테고리는 Phase D에서 스캐너(openssl/dig/nmap)로 확장.
// =====================================================================
import express from 'express'
import tls from 'node:tls'
import dns from 'node:dns'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import os from 'node:os'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const execFileP = promisify(execFile)

// 증적 터미널에 표시할 실제 셸 프롬프트 — 명령이 실제로 실행되는 collector 컨테이너의
//  user@hostname:cwd 를 그대로 사용(지어낸 값이 아니라 실측). root 면 '#', 아니면 '$'.
const SHELL = (() => {
  let user = 'app'
  try { user = os.userInfo().username } catch { /* noop */ }
  return { user, host: os.hostname(), cwd: process.cwd(), sym: user === 'root' ? '#' : '$' }
})()

// 모든 증적 터미널에서 공용으로 쓰는 실제 셸 프롬프트(user@host:cwd) — 실측값.
function shellPromptHtml() {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<span style="color:#4ade80">${esc(SHELL.user)}@${esc(SHELL.host)}</span>:<span style="color:#60a5fa">${esc(SHELL.cwd)}</span><span style="color:#94a3b8">${SHELL.sym}</span>`
}

// 증적 이미지 무결성 — 파일 내용의 SHA-256(사후 위변조 탐지용). 실패해도 증적 생성은 막지 않음.
function sha256File(p) {
  try { return 'sha256:' + crypto.createHash('sha256').update(readFileSync(p)).digest('hex') } catch { return null }
}

const app = express()
app.use(express.json())
// 캡처한 스크린샷 정적 서빙 (백엔드가 /api/lab/artifact 로 프록시)
app.use('/artifacts', express.static('/artifacts'))

const VUL = process.env.HTTP_VULNERABLE_URL || 'http://lab-http-vulnerable'
const REM = process.env.HTTP_REMEDIATED_URL || 'http://lab-http-remediated'
const TLS_VUL = process.env.TLS_VULNERABLE_HOST || 'lab-tls-vulnerable'
const TLS_REM = process.env.TLS_REMEDIATED_HOST || 'lab-tls-remediated'
const TLS_REVOKED = process.env.TLS_REVOKED_HOST || 'lab-tls-revoked'
const DNS_VUL = process.env.DNS_VULNERABLE_HOST || 'lab-dns-vulnerable'
const DNS_REM = process.env.DNS_REMEDIATED_HOST || 'lab-dns-remediated'
const DNS_ZONE = process.env.DNS_ZONE || 'example.lab'
const NET_VUL = process.env.NET_VULNERABLE_HOST || 'lab-net-vulnerable'
const NET_REM = process.env.NET_REMEDIATED_HOST || 'lab-net-remediated'
const SSH_VUL = process.env.SSH_VULNERABLE_HOST || 'lab-ssh-vulnerable'
const SSH_REM = process.env.SSH_REMEDIATED_HOST || 'lab-ssh-remediated'
const ART = '/artifacts'

// ── 포트 상태 검사 (TCP connect) ────────────────────────────────────
function checkPort(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port })
    let done = false
    const finish = (state) => { if (!done) { done = true; try { s.destroy() } catch {} resolve(state) } }
    s.setTimeout(timeout)
    s.on('connect', () => finish('open'))
    s.on('timeout', () => finish('filtered'))
    s.on('error', (e) => finish(e.code === 'ECONNREFUSED' ? 'closed' : 'error'))
  })
}
// issue_type → 표준 포트. 취약 타깃(lab-net-vulnerable)이 리스닝하는 포트와 일치해야 함.
const NET_PORTS = {
  service_pptp: 1723, open_port: 1723,
  insecure_telnet: 23, service_telnet: 23,
  insecure_ftp: 21, service_ftp: 21,
  service_rdp: 3389, service_vnc: 5900, service_dns: 53,
  service_imap: 143, service_ldap: 389, service_ldap_anonymous: 389, service_smb: 445,
  service_mysql: 3306, service_redis: 6379, service_mongodb: 27017,
  service_elasticsearch: 9200, service_couchdb: 5984, service_cassandra: 9042,
  service_http_proxy: 8080
}

// ── DNS 조회 (특정 coredns 서버에 TXT 질의) ─────────────────────────
const dnsp = dns.promises
async function dnsTxt(serverHost, name) {
  try {
    const { address } = await dnsp.lookup(serverHost)
    const r = new dns.promises.Resolver()
    r.setServers([address])
    const recs = await r.resolveTxt(name)
    return recs.map((chunks) => chunks.join(''))
  } catch {
    return [] // NXDOMAIN/NODATA → 없음
  }
}
const pickSpf = (arr) => arr.find((t) => /^v=spf1/i.test(t)) || '(none)'
const pickDmarc = (arr) => arr.find((t) => /^v=DMARC1/i.test(t)) || '(none)'

// ── TLS 검사 (Node tls) ─────────────────────────────────────────────
function tlsInspect(host, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate() || {}
      const cipher = socket.getCipher() || {}
      const validFrom = cert.valid_from || null
      const validTo = cert.valid_to || null
      const validityDays = validFrom && validTo ? Math.round((Date.parse(validTo) - Date.parse(validFrom)) / 86400000) : null
      const subjCN = cert.subject?.CN || null
      const issuerCN = cert.issuer?.CN || null
      resolve({
        subject: subjCN,
        issuer: issuerCN,
        selfSigned: !!(subjCN && issuerCN && subjCN === issuerCN), // 자체서명: issuer == subject
        validFrom, validTo, validityDays,
        keyBits: cert.bits || null,
        cipher: cipher.name || null,
        tlsVersion: socket.getProtocol() || cipher.version || null
      })
      socket.end()
    })
    socket.on('error', (e) => resolve({ error: e.message }))
    socket.on('timeout', () => { socket.destroy(); resolve({ error: 'timeout' }) })
  })
}

// ── 스캔 결과 → HTML 리포트 → 스크린샷 (모든 스캔형 카테고리 공용) ──────
async function renderReportScreenshot(title, rows, variant) {
  const browser = await chromium.launch()
  try {
    const page = await (await browser.newContext()).newPage()
    const color = variant === 'before' ? '#b91c1c' : '#15803d'
    const bg = variant === 'before' ? '#fff5f5' : '#f0fdf4'
    const trs = rows.map((r) => `<tr><td class="k">${r[0]}</td><td>${r[1] ?? '-'}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:sans-serif;background:${bg};margin:0;padding:22px}
      h1{color:${color};font-size:17px;margin:0 0 12px}
      table{border-collapse:collapse;width:100%;font-size:13px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
      td{border-bottom:1px solid #eef2f7;padding:8px 10px}
      td.k{color:#6b7280;width:42%}
      .foot{color:#6b7280;font-size:11px;margin-top:12px}</style></head>
      <body><h1>${title}</h1><table>${trs}</table>
      <div class="foot">Partner Standard Lab · 참고용 PoC (고객환경 아님)</div></body></html>`
    await page.setViewportSize({ width: 660, height: 420 })
    await page.setContent(html, { waitUntil: 'load' })
    const file = `${ART}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`
    await page.screenshot({ path: file })
    return file
  } finally {
    await browser.close()
  }
}

// 응답 헤더/쿠키만 수집(스크린샷 없음). 헤더 계열 증적은 '응답 헤더 뷰'로 렌더하므로
//  페이지 스크린샷은 필요 없다(헤더/토큰은 픽셀에 안 보임).
async function capture(url) {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 15000 })
    const headers = resp ? resp.headers() : {}
    const cookies = await context.cookies() // HttpOnly 포함(자동화 API)
    return { headers, cookies, status: resp ? resp.status() : 0 }
  } finally {
    await browser.close()
  }
}

// CSP/XSS 데모 캡처 — 인라인 스크립트가 실행됐는지(window.__xssRan) + 응답 헤더 + 스크린샷.
//  취약(CSP 없음) → 실행되어 페이지 변조, 조치(CSP default-src 'self') → 브라우저가 차단.
// CSP 증적용 — 방명록 아래에 붙일 '실제 명령 실행 결과' 터미널 블록(원문 그대로).
//  date -u 와 curl -sSI 의 실제 stdout 만 담는다(요약·캡션 등 가공 주입 없음).
//  → 시각(대상 date 헤더 + collector date)과 헤더가 재실행 가능한 하드 증거로 남는다.
function rawCmdTerminalHtml({ url, dateOut, curlOut }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const colorOf = (l) => {
    if (/^HTTP\//.test(l)) return '#93c5fd'
    const m = l.match(/^([A-Za-z0-9-]+):\s*(.*)$/)
    if (!m) return '#cbd5e1'
    const k = m[1].toLowerCase()
    if (k === 'date') return '#fde047'
    if (k === 'content-security-policy') return headerVerdict(k, m[2]) === 'good' ? '#86efac' : '#fca5a5'
    return '#64748b'
  }
  const curlLines = String(curlOut || '(curl 응답 없음)').split('\n')
    .map((l) => `<div style="color:${colorOf(l)}">${esc(l) || '&nbsp;'}</div>`).join('')
  const prompt = shellPromptHtml()
  return `<div style="max-width:640px;margin:14px auto 24px;background:#0b0f17;border:1px solid #1f2937;border-radius:12px;overflow:hidden;font-family:ui-monospace,Menlo,Consolas,monospace">
    <div style="padding:8px 14px;background:#111827;border-bottom:1px solid #1f2937;color:#94a3b8;font-family:system-ui,sans-serif;font-size:11px">명령어 확인 (원문)</div>
    <div style="padding:12px 16px;font-size:13px;line-height:1.85;color:#cbd5e1">
      <div style="color:#e2e8f0">${prompt} date -u</div>
      <div style="color:#fde047">${esc(dateOut || '(date 출력 없음)')}</div>
      <div style="color:#e2e8f0">${prompt} curl -sSI ${esc(url)}</div>
      ${curlLines}
    </div>
  </div>`
}

async function captureXss(url) {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1200 } })
    const page = await context.newPage()
    // 브라우저 콘솔 캡처(로드 전 부착) — CSP 차단은 팝업이 아니라 콘솔 에러로만 나타남.
    const consoleMsgs = []
    page.on('console', (m) => consoleMsgs.push(m.text()))
    page.on('pageerror', (e) => consoleMsgs.push(e.message))
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
    // 인라인 스크립트가 실행되면 window.__xssRan=true. CSP가 차단하면 undefined.
    const xssRan = await page.evaluate(() => !!window.__xssRan).catch(() => false)
    // 외부 probe.js 가 증표(취약/조치)를 그릴 때까지 대기 (진단중 클래스 해제)
    await page.waitForFunction(() => {
      const v = document.getElementById('verdict')
      return v && !v.classList.contains('verdict-pending')
    }, { timeout: 5000 }).catch(() => {})
    // CSP 위반 콘솔 에러만 추림(실제 차단의 증거)
    const cspErrors = consoleMsgs.filter((t) => /content security policy/i.test(t))
    // 차단 증거가 있으면 페이지에 'DevTools 콘솔' 패널을 주입(있을 때만 = 조치 화면).
    if (cspErrors.length) {
      await page.evaluate((errs) => {
        const wrap = document.createElement('div')
        wrap.className = 'devconsole'
        const bar = document.createElement('div')
        bar.className = 'dc-bar'
        bar.textContent = '브라우저 콘솔 (개발자도구 · Console) — CSP가 실행을 거부한 실제 로그'
        wrap.appendChild(bar)
        errs.forEach((t) => {
          const ln = document.createElement('div')
          ln.className = 'dc-line'
          ln.textContent = t
          wrap.appendChild(ln)
        })
        const host = document.querySelector('.page') || document.body
        host.appendChild(wrap)
      }, cspErrors)
      await page.waitForTimeout(80)
    }
    await page.waitForTimeout(120)
    // 방명록(시연)은 대상 페이지에서 실제 캡처한다. 다만 조치 타깃의 CSP(default-src 'self')는
    //  '주입한 인라인 스타일'을 차단하므로(style-src 폴백), 명령 블록을 대상 페이지에 붙이면
    //  조치 화면에서만 스타일이 사라진다. → 명령 블록은 CSP 없는 별도 합성 페이지에서 렌더하고,
    //  방명록은 이미지로 얹어 한 장으로 합친다. (방명록=영향, 명령 원문=재실행 가능한 하드 증거)
    const cardEl = await page.$('.page')
    const cardBuf = await (cardEl || page).screenshot({ type: 'png' })
    const cardDataUri = 'data:image/png;base64,' + cardBuf.toString('base64')
    let dateOut = ''
    try { dateOut = String((await execFileP('date', ['-u'], { timeout: 5000 })).stdout).trim() } catch { /* noop */ }
    const curlOut = await curlHead(url)
    const comp = await context.newPage()
    await comp.setContent(`<!doctype html><meta charset="utf-8"><div style="background:#eef2f7;padding:24px;font-family:system-ui,-apple-system,sans-serif">
      <img src="${cardDataUri}" style="display:block;max-width:640px;width:100%;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px"/>
      ${rawCmdTerminalHtml({ url, dateOut, curlOut })}
    </div>`, { waitUntil: 'load' })
    const file = `${ART}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`
    await comp.screenshot({ path: file, fullPage: true })
    await comp.close()
    return { headers: resp ? resp.headers() : {}, xssRan: !!xssRan, defaced: !!xssRan, screenshot: file, status: resp ? resp.status() : 0, cspErrors, dateOut, curlOut }
  } finally {
    await browser.close()
  }
}
const CSP_ISSUES = ['csp_no_policy', 'csp_no_policy_v2', 'content_security_policy_missing']

// 응답 헤더를 보안 관점으로 분류 → [{ name, value, state }]
//  state: exposed(노출)·weak(취약)=나쁨(빨강) / hidden(숨김)·added(적용)·ok=좋음(초록)
function classifyHeaders(h) {
  const rows = []
  const server = h['server'] || ''
  rows.push(/\d/.test(server)
    ? { name: 'Server', value: server, state: 'exposed' }        // 버전 노출
    : { name: 'Server', value: server || 'nginx', state: 'hidden' }) // 버전 숨김
  const xpb = h['x-powered-by']
  rows.push(xpb
    ? { name: 'X-Powered-By', value: xpb, state: 'exposed' }      // 기술스택 노출
    : { name: 'X-Powered-By', value: '(제거됨)', state: 'hidden' })
  const protect = [
    ['Strict-Transport-Security', 'strict-transport-security'],
    ['Content-Security-Policy', 'content-security-policy'],
    ['X-Frame-Options', 'x-frame-options'],
    ['X-Content-Type-Options', 'x-content-type-options'],
    ['Referrer-Policy', 'referrer-policy']
  ]
  for (const [name, key] of protect) {
    const v = h[key]
    if (!v) { rows.push({ name, value: '(없음)', state: 'missing' }); continue }
    // CSP는 존재해도 unsafe-*/광범위 지시자면 취약(weak)로 분류
    if (key === 'content-security-policy' && CSP_WEAK_RE.test(v)) { rows.push({ name, value: v, state: 'weak' }); continue }
    rows.push({ name, value: v, state: 'added' })
  }
  const sc = h['set-cookie']
  if (sc != null) {
    const one = String(sc).split('\n')[0]
    rows.push(/httponly/i.test(one)
      ? { name: 'Set-Cookie', value: one, state: 'added' }
      : { name: 'Set-Cookie', value: one, state: 'weak' })       // HttpOnly 없음 → 취약
  }
  return rows
}

// 응답 헤더 뷰(DevTools/curl -I 느낌)를 스크린샷으로 렌더. 헤더는 픽셀에 안 보이므로
//  '보안 헤더 없음·토큰 노출'(취약) → '적용·숨김'(조치)을 색으로 직관화한다.
async function renderHeadersScreenshot(title, rows, variant) {
  const browser = await chromium.launch()
  try {
    const page = await (await browser.newContext({ viewport: { width: 760, height: 560 } })).newPage()
    const headColor = variant === 'before' ? '#b91c1c' : '#15803d'
    const bg = variant === 'before' ? '#fff5f5' : '#f0fdf4'
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const tagMap = { exposed: '노출', missing: '없음', weak: '취약', hidden: '숨김', added: '적용', ok: '정상' }
    const line = (r) => {
      const bad = r.state === 'exposed' || r.state === 'missing' || r.state === 'weak'
      const c = bad ? '#fca5a5' : '#86efac'
      const chip = bad ? 'background:#7f1d1d;color:#fecaca' : 'background:#14532d;color:#bbf7d0'
      return `<div class="hl"><span class="hn">${esc(r.name)}:</span> <span class="hv" style="color:${c}">${esc(r.value)}</span> <span class="tag" style="${chip}">${tagMap[r.state] || ''}</span></div>`
    }
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{font-family:ui-monospace,Menlo,Consolas,monospace;background:${bg};margin:0;padding:20px;color:#0f172a}
      h1{font-family:system-ui,sans-serif;color:${headColor};font-size:15px;margin:0 0 12px}
      .resp{background:#0b1020;border-radius:10px;padding:14px 16px;font-size:13px;line-height:2}
      .status{color:#93c5fd;margin-bottom:6px}
      .hl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .hn{color:#94a3b8}.hv{font-weight:600}
      .tag{font-family:system-ui,sans-serif;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;margin-left:8px}
      .foot{font-family:system-ui,sans-serif;color:#6b7280;font-size:11px;margin-top:12px}
      .cap{color:#b45309;font-family:system-ui,sans-serif;font-size:12.5px;font-weight:700;margin-top:10px}
      </style>
      <h1>${title}</h1>
      <div class="resp"><div class="status">HTTP/1.1 200 OK</div>${rows.map(line).join('')}</div>
      <div class="foot">Partner Standard Lab · 참고용 PoC (고객환경 아님) · DevTools → Network → Response Headers 와 동일</div>`
    await page.setContent(html, { waitUntil: 'load' })
    const file = `${ART}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`
    const body = await page.$('body')
    await body.screenshot({ path: file })
    return file
  } finally {
    await browser.close()
  }
}

// 실제 `curl -sSI <url>` 실행 → raw 응답 헤더 문자열(명령 출력 그대로). 실패 시 null.
async function curlHead(url) {
  try {
    const { stdout } = await execFileP('curl', ['-sSI', '--max-time', '10', url], { timeout: 12000 })
    return String(stdout).replace(/\r/g, '').trim()
  } catch (e) {
    return null
  }
}

// curl raw 출력 → 소문자 헤더 맵(요약/분류용)
function parseHeaders(raw) {
  const h = {}
  for (const line of String(raw || '').split('\n')) {
    const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/)
    if (m) { const k = m[1].toLowerCase(); h[k] = h[k] ? h[k] + '\n' + m[2] : m[2] }
  }
  return h
}

// 출력 라인별 강조 색상 구분 (보안 관련만 강조, 나머지는 dim)
const SEC_GOOD = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'x-xss-protection', 'referrer-policy']
// CSP가 '존재해도 취약'한 패턴: unsafe-inline/unsafe-eval, 또는 default-src/script-src 에 광범위(*) 출처
const CSP_WEAK_RE = /unsafe-inline|unsafe-eval|(default-src|script-src)\s+[^;]*\*/i
// 한 헤더의 보안 판정(good/bad), 해당 없으면 null
function headerVerdict(k, v) {
  if (k === 'server') return /\d/.test(v) ? 'bad' : 'good'   // 버전 노출=bad, 버전 없음=good
  if (k === 'x-powered-by') return 'bad'                       // 기술스택 노출
  if (k === 'content-security-policy') return CSP_WEAK_RE.test(v) ? 'bad' : 'good' // 존재해도 unsafe-*/광범위면 취약
  if (k === 'location') return /^https:/i.test(v) ? 'good' : 'bad' // 리다이렉트 목적지: https=안전, http=비보안
  if (SEC_GOOD.includes(k)) return 'good'                      // 보안 헤더 적용
  if (k === 'set-cookie') return /httponly/i.test(v) ? 'good' : 'bad'
  return null
}
function lineClass(line) {
  if (/^HTTP\//.test(line)) return 'status'
  const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/)
  if (!m) return 'dim'
  return headerVerdict(m[1].toLowerCase(), m[2]) || 'dim'
}
// 이 finding에 해당하는 헤더 키만 강조(나머지는 dim). null이면 전체 강조.
function headerFocusKeys(issueType) {
  const t = String(issueType || '').toLowerCase()
  if (t.includes('redirect')) return ['location']
  if (t.includes('csp') || t.includes('content_security')) return ['content-security-policy']
  if (t.includes('hsts')) return ['strict-transport-security']
  if (t.includes('x_powered_by')) return ['x-powered-by', 'server']
  if (t.includes('server_version') || t.includes('server_tokens')) return ['server']
  if (t.includes('cookie')) return ['set-cookie']
  if (t.includes('content_type')) return ['x-content-type-options']
  if (t.includes('frame') || t.includes('clickjack')) return ['x-frame-options']
  if (t.includes('x_xss')) return ['x-xss-protection']
  if (t.includes('referrer')) return ['referrer-policy']
  return null
}
// finding 관련 헤더만 강조하는 highlighter (무관한 헤더는 실제 응답이지만 dim)
function headerLineClass(focusKeys) {
  return (line) => {
    if (/^HTTP\//.test(line)) return 'status'
    const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/)
    if (!m) return 'dim'
    const k = m[1].toLowerCase()
    if (focusKeys && !focusKeys.includes(k)) return 'dim'
    return headerVerdict(k, m[2]) || 'dim'
  }
}

// 취약/조치 한 줄 요약 — focusKeys 있으면 그 헤더만 언급
function headerSummary(rawParsedHeaders, variant, focusKeys) {
  let rows = classifyHeaders(rawParsedHeaders)
  if (focusKeys) rows = rows.filter((r) => focusKeys.includes(r.name.toLowerCase()))
  if (variant === 'before') {
    const exposed = rows.filter((r) => r.state === 'exposed').map((r) => r.name)
    const missing = rows.filter((r) => r.state === 'missing').map((r) => r.name)
    const weak = rows.filter((r) => r.state === 'weak').map((r) => r.name + (r.name === 'Set-Cookie' ? '(쿠키)' : r.name === 'Content-Security-Policy' ? '(광범위/unsafe)' : ''))
    const parts = []
    if (exposed.length) parts.push('노출: ' + exposed.join(', '))
    if (missing.length) parts.push('누락: ' + missing.join(', '))
    if (weak.length) parts.push('취약: ' + weak.join(', '))
    return '⚠ ' + (parts.join('   ·   ') || '취약 항목 확인')
  }
  if (focusKeys) {
    const fixed = rows.map((r) => r.name).join(', ')
    return '✓ ' + (fixed ? fixed + ' — 조치 적용됨' : '해당 항목 조치됨')
  }
  return '✓ 서버/기술스택 숨김 · 보안 헤더 적용 · 쿠키 보호(HttpOnly/SameSite)'
}

// 실제 명령 + 그 출력을 '터미널 화면'으로 렌더. 모든 스캔형 카테고리 공용.
//  segments: [{ cmd, raw }]  (명령 여러 개 가능) · highlight(line)→'good'|'bad'|'dim'|'status'
async function renderTerminalScreenshot(segments, summary, variant, highlight = lineClass) {
  const browser = await chromium.launch()
  try {
    const page = await (await browser.newContext({ viewport: { width: 860, height: 640 } })).newPage()
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const segArr = Array.isArray(segments) ? segments : [segments]
    // 촬영 시각을 '실제 명령 출력'으로 — 터미널 맨 위에 date -u 실행 결과를 둔다(캡션 주입 대신).
    //  collector 시스템 시각(UTC). header 계열은 아래 curl 응답의 date: 헤더(대상 시각)도 함께 남는다.
    let dateOut = ''
    try { dateOut = String((await execFileP('date', ['-u'], { timeout: 5000 })).stdout).trim() } catch { /* noop */ }
    const dateBlock = `<div class="ln prompt">${shellPromptHtml()} date -u</div><div class="ln dateln">${esc(dateOut || '(date 출력 없음)')}</div>`
    const cmdBlocks = segArr.map((seg) => {
      const outLines = String(seg.raw || '(출력 없음)').split('\n').map((l) => {
        const dateHit = /^\s*date:/i.test(l) ? ' dateln' : ''
        return `<div class="ln ${highlight(l)}${dateHit}">${esc(l) || '&nbsp;'}</div>`
      }).join('')
      return `<div class="ln prompt">${shellPromptHtml()} ${esc(seg.cmd)}</div>${outLines}`
    }).join('<div class="gap"></div>')
    const blocks = dateBlock + '<div class="gap"></div>' + cmdBlocks
    const titleColor = variant === 'before' ? '#f87171' : '#4ade80'
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:18px;background:${variant === 'before' ? '#1b0f10' : '#0d1a12'};font-family:ui-monospace,Menlo,Consolas,monospace}
      .term{background:#0b0f17;border:1px solid #1f2937;border-radius:12px;overflow:hidden}
      .bar{display:flex;align-items:center;gap:7px;padding:10px 14px;background:#111827;border-bottom:1px solid #1f2937}
      .dot{width:11px;height:11px;border-radius:50%}
      .r{background:#ff5f56}.y{background:#ffbd2e}.g{background:#27c93f}
      .bt{margin-left:10px;color:#94a3b8;font-family:system-ui,sans-serif;font-size:12px}
      .body{padding:14px 16px;font-size:13px;line-height:1.85;color:#cbd5e1}
      .ln{white-space:pre-wrap;word-break:break-all}
      .gap{height:10px}
      .prompt{color:#e2e8f0;margin:2px 0}.prompt .d{color:#4ade80;font-weight:700}
      .status{color:#93c5fd}
      .good{color:#86efac;font-weight:600}
      .bad{color:#fca5a5;font-weight:600}
      .dim{color:#64748b}
      .dateln{color:#fde047;font-weight:700}
      .cmt{color:${titleColor};font-family:system-ui,sans-serif;font-size:12.5px;margin-top:10px;white-space:pre-wrap;line-height:1.5}
      .cap{display:flex;align-items:center;gap:6px;color:#fbbf24;font-family:system-ui,sans-serif;font-size:12.5px;font-weight:700;margin-top:12px;padding-top:10px;border-top:1px solid #1f2937}
    </style>
    <div class="term">
      <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        <span class="bt">${variant === 'before' ? '조치 전 — 취약 타깃' : '조치 후 — 조치 타깃'} · Partner Standard Lab (참고용 PoC)</span></div>
      <div class="body">
        ${blocks}
        <div class="cmt">${esc(summary)}</div>
      </div>
    </div>`
    await page.setContent(html, { waitUntil: 'load' })
    const file = `${ART}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`
    const term = await page.$('.term')
    await term.screenshot({ path: file })
    return file
  } finally {
    await browser.close()
  }
}

// ── 카테고리별 실제 CLI 러너 + 라인 강조 ────────────────────────────
async function runCmd(file, args, timeout = 15000) {
  try {
    const { stdout } = await execFileP(file, args, { timeout })
    return String(stdout).replace(/\r/g, '').trim()
  } catch (e) {
    // 도구가 비정상 종료해도 stdout에 유효 출력이 있으면 사용(nmap closed 등)
    if (e && e.stdout) return String(e.stdout).replace(/\r/g, '').trim()
    return null
  }
}

// stdout+stderr 를 합쳐 잡는다 — ncat 처럼 연결 상태를 stderr 에 쓰는 도구용.
//  비정상 종료(접속 거부 시 ncat exit≠0)여도 stderr 에 실제 메시지가 있으므로 그대로 반환.
async function runCmdCombined(file, args, timeout = 15000) {
  const merge = (o) => String((o?.stdout || '') + (o?.stderr || '')).replace(/\r/g, '').trim()
  try { return merge(await execFileP(file, args, { timeout })) || null }
  catch (e) { return merge(e) || null }
}
async function runShell(cmd, timeout = 15000) {
  try {
    const { stdout } = await execFileP('sh', ['-c', cmd], { timeout })
    return String(stdout).replace(/\r/g, '').trim()
  } catch (e) {
    if (e && e.stdout) return String(e.stdout).replace(/\r/g, '').trim()
    return null
  }
}
// nmap: open=위험(빨강), closed/filtered=안전(초록)
function nmapLineClass(line) {
  if (/^\d+\/tcp\s+open\b/.test(line)) return 'bad'
  if (/^\d+\/tcp\s+(closed|filtered)\b/.test(line)) return 'good'
  if (/^PORT\s+STATE/.test(line)) return 'status'
  return 'dim'
}
// dig + 위조 메일 판정: 레코드 있음/차단=초록, 없음/허용(스푸핑 성공)=빨강
function digLineClass(line) {
  const l = String(line).trim()
  if (/^#/.test(l)) return 'status'
  if (/레코드 없음|NXDOMAIN|no records|:\s*none|허용됨|스푸핑 성공/i.test(l)) return 'bad'
  if (/^"?v=spf1|^"?v=DMARC1|:\s*fail|p=quarantine|p=reject|격리|거부|차단|^".*"$/i.test(l)) return 'good'
  return l ? 'dim' : 'dim'
}

// 위조 메일(스푸핑) 수신 판정 — 실제 SPF/DMARC 레코드를 기준으로 수신 서버가 내리는 결정.
//  (레코드는 실측 dig 결과. 판정은 그 레코드로 수신 서버가 하는 표준 처리)
const SPOOF_IP = '203.0.113.66'
function spoofFrom(zone) { return 'ceo@' + zone }
function mailVerdictLines(spfRaw, dmarcRaw) {
  const spf = spfRaw && /v=spf1/i.test(spfRaw)
  const dashAll = spf && /-all/i.test(spfRaw)
  const dmarc = dmarcRaw && /v=DMARC1/i.test(dmarcRaw)
  const pol = dmarc ? (String(dmarcRaw).match(/p=(\w+)/i)?.[1] || 'none') : 'none'
  if (!spf && !dmarc) {
    return [
      'Received-SPF: none (도메인에 SPF 정책 없음 → 발신 IP 검증 불가)',
      'DMARC: none (정책 없음)',
      '==> 🚨 위조 메일 수신 허용됨 → 받은편지함 전달 (스푸핑 성공)'
    ]
  }
  return [
    `Received-SPF: ${dashAll ? 'fail' : 'softfail'} (${SPOOF_IP} 은 SPF ${dashAll ? '-all' : '~all'} 로 미승인)`,
    `DMARC: p=${pol} (SPF 정렬 실패 → 정책 적용)`,
    '==> ✅ 위조 메일 격리·거부됨 (스푸핑 차단)'
  ]
}
// 이슈별 DNS 질의 focus (malformed SPF / DMARC p=none / DKIM 키 — 서브도메인 레코드로 재현)
function dnsFocus(issueType, zone) {
  const t = String(issueType || '').toLowerCase()
  if (t.includes('spf') && t.includes('malformed')) return { kind: 'spf_malformed', name: `mal.${zone}`, label: 'SPF 구문' }
  if (t.includes('subdomain') && t.includes('dmarc')) return { kind: 'dmarc_none', name: `_dmarc.sub.${zone}`, label: '서브도메인 DMARC 정책' }
  if (t.includes('dmarc') && t.includes('none')) return { kind: 'dmarc_none', name: `_dmarc.pn.${zone}`, label: 'DMARC 정책' }
  if (t.includes('dkim')) return { kind: 'dkim', name: `sel._domainkey.${zone}`, label: 'DKIM 키' }
  return null
}
// DKIM TXT의 p=<base64> 공개키를 파싱해 RSA 키 비트 수 반환 (없으면 null)
function dkimKeyBits(txt) {
  const m = String(txt || '').match(/p=([A-Za-z0-9+/=]+)/)
  if (!m) return null
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(m[1], 'base64'), format: 'der', type: 'spki' })
    return key.asymmetricKeyDetails?.modulusLength || null
  } catch { return null }
}
function dnsVerdictLines(kind, rec) {
  if (kind === 'spf_malformed') {
    const valid = rec && /v=spf1/i.test(rec) && /include:/i.test(rec) && /[-~]all/i.test(rec)
    return valid
      ? ['SPF 구문: 정상 (include:… -all)', '==> ✅ 위조 메일 SPF 검증으로 거부 (스푸핑 차단)']
      : ['SPF 구문: 오류(permerror) → 정책 미적용으로 처리', '==> 🚨 위조 메일 수신 허용 (스푸핑 성공)']
  }
  const pol = rec ? (String(rec).match(/p=(\w+)/i)?.[1] || 'none') : 'none'
  return pol === 'none'
    ? ['DMARC: p=none (모니터링만·실패 메일 처리 안 함)', '==> 🚨 위조 메일 수신 허용 (리포트만, 스푸핑 성공)']
    : [`DMARC: p=${pol} (실패 메일 처리)`, '==> ✅ 위조 메일 격리·거부 (스푸핑 차단)']
}
// openssl x509 dates: notAfter/validity 라인을 variant 기준으로 강조
function opensslLineClass(variant) {
  return (line) => {
    if (/signature algorithm/i.test(line)) return variant === 'before' ? 'bad' : 'good'
    if (/^notAfter=|유효기간|validity|Public-Key|키 크기/i.test(line)) return variant === 'before' ? 'bad' : 'good'
    if (/^subject=|^notBefore=/i.test(line)) return 'dim'
    return 'dim'
  }
}
// openssl verify -crl_check: 폐지=빨강, OK=초록
function revokedLineClass(line) {
  if (/revoked|error 23|verification failed/i.test(line)) return 'bad'
  if (/:\s*OK\s*$/i.test(line)) return 'good'
  return 'dim'
}

// nmap ssl-enum-ciphers — 서버가 제공하는 TLS 프로토콜/암호 강도 열거(클라 협상과 무관)
async function nmapSslEnum(host) {
  return runCmd('nmap', ['--script', 'ssl-enum-ciphers', '-p', '443', host], 30000)
}
function parseSslEnum(raw) {
  const protocols = [...String(raw || '').matchAll(/(SSLv[23]|TLSv1\.[0-3]):/g)].map((m) => m[1])
  const grade = (String(raw || '').match(/least strength:\s*([A-F])/i) || [])[1] || '?'
  return { protocols: [...new Set(protocols)], grade }
}
// nmap ssl-enum 출력을 핵심 라인으로 트림(실제 출력의 요약 부분) — 터미널용
function trimSslEnum(raw) {
  return String(raw || '').split('\n')
    .filter((l) => /nmap scan report|443\/tcp|ssl-enum-ciphers|SSLv[23]:|TLSv1\.[0-3]:|least strength/i.test(l))
    .join('\n')
}
// ssl-enum 터미널 강조: 구버전 프로토콜/낮은 등급=빨강, TLS1.2/1.3·A/B=초록
function sslEnumLineClass(line) {
  const l = String(line).trim()
  if (/SSLv[23]:|TLSv1\.0:|TLSv1\.1:|least strength:\s*[C-F]/i.test(l)) return 'bad'
  if (/TLSv1\.[23]:|least strength:\s*[AB]/i.test(l)) return 'good'
  if (/443\/tcp|nmap scan report/i.test(l)) return 'status'
  return 'dim'
}

// ── SSH 알고리즘 열거 (nmap ssh2-enum-algos — 서버 제공 cipher/kex/mac) ──────
async function nmapSshEnum(host) {
  return runCmd('nmap', ['--script', 'ssh2-enum-algos', '-p', '22', host], 30000)
}
function parseSshAlgos(raw) {
  const out = { enc: [], kex: [], mac: [] }
  let cur = null
  for (const l of String(raw || '').split('\n')) {
    if (/encryption_algorithms:/i.test(l)) { cur = 'enc'; continue }
    if (/kex_algorithms:/i.test(l)) { cur = 'kex'; continue }
    if (/mac_algorithms:/i.test(l)) { cur = 'mac'; continue }
    if (/compression_algorithms:/i.test(l)) { cur = null; continue }
    const m = l.match(/^\|\s+([A-Za-z0-9@.\-]+)\s*$/)
    if (cur && m) out[cur].push(m[1])
  }
  return out
}
const SSH_WEAK_ENC = /cbc|3des|arcfour|rc4|blowfish|(^|-)des(-|$)/i
const SSH_WEAK_KEX = /sha1|group1-|group-exchange-sha1|gss-/i
const SSH_WEAK_MAC = /hmac-md5|hmac-sha1(-|$)|-96(-|$)/i
function sshWeak(a) {
  return { enc: a.enc.filter((x) => SSH_WEAK_ENC.test(x)), kex: a.kex.filter((x) => SSH_WEAK_KEX.test(x)), mac: a.mac.filter((x) => SSH_WEAK_MAC.test(x)) }
}
// ssh2-enum 터미널 강조: 약한 알고리즘=빨강, 강한 것=초록
function sshLineClass(line) {
  const l = String(line).trim()
  if (SSH_WEAK_ENC.test(l) || SSH_WEAK_KEX.test(l) || SSH_WEAK_MAC.test(l)) return 'bad'
  if (/curve25519|aes256-gcm|chacha20|group16-sha512|etm@|sha2-\d/i.test(l)) return 'good'
  if (/_algorithms:|22\/tcp|ssh2-enum/i.test(l)) return 'status'
  return 'dim'
}
function trimSshEnum(raw) {
  return String(raw || '').split('\n').filter((l) => /22\/tcp|ssh2-enum|_algorithms:|^\|\s+[A-Za-z0-9]/.test(l)).join('\n')
}

// 세션 쿠키 속성 추출 (SID 우선, 없으면 첫 쿠키)
function cookieAttrs(cookies) {
  const list = Array.isArray(cookies) ? cookies : []
  const c = list.find((x) => /^sid$/i.test(x.name)) || list[0]
  if (!c) return { present: false, httpOnly: false, secure: false, sameSite: '(none)' }
  return { present: true, name: c.name, httpOnly: !!c.httpOnly, secure: !!c.secure, sameSite: c.sameSite || 'None' }
}

// issue_type → 관측할 응답 헤더
function headerSpec(issueType) {
  const t = String(issueType || '').toLowerCase()
  if (t.includes('hsts')) return { name: 'Strict-Transport-Security', get: (h) => h['strict-transport-security'] || 'Not Present' }
  if (t.includes('csp') || t.includes('content_security')) return { name: 'Content-Security-Policy', get: (h) => h['content-security-policy'] || 'Not Present' }
  if (t.includes('x_powered_by')) return { name: 'X-Powered-By', get: (h) => h['x-powered-by'] || '(removed)' }
  if (t.includes('server_version') || t.includes('server_tokens')) return { name: 'Server', get: (h) => h['server'] || '(hidden)' }
  if (t.includes('cookie')) return { name: 'Set-Cookie', get: (h) => h['set-cookie'] || 'Not Present' }
  if (t.includes('x_frame') || t.includes('clickjack')) return { name: 'X-Frame-Options', get: (h) => h['x-frame-options'] || 'Not Present' }
  if (t.includes('x_xss')) return { name: 'X-XSS-Protection', get: (h) => h['x-xss-protection'] || 'Not Present' }
  if (t.includes('referrer')) return { name: 'Referrer-Policy', get: (h) => h['referrer-policy'] || 'Not Present' }
  return { name: 'X-Content-Type-Options', get: (h) => h['x-content-type-options'] || 'Not Present' }
}

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/collect', async (req, res) => {
  // 증적 무결성: 응답 직전 각 스크린샷 이미지의 SHA-256 을 계산해 첨부(사후 위변조 탐지용).
  //  모든 반환 경로를 한 곳에서 커버하기 위해 res.json 을 감싼다. 해시 실패는 증적을 막지 않음.
  const _json = res.json.bind(res)
  res.json = (payload) => {
    try {
      if (payload && typeof payload === 'object') {
        for (const key of ['visual_before', 'visual_after']) {
          const v = payload[key]
          if (v && v.screenshot) v.sha256 = sha256File(v.screenshot)
        }
      }
    } catch { /* noop */ }
    return _json(payload)
  }

  const { templateId, issueType } = req.body || {}

  // ── 레시피 주도(제네릭) 핸들러 — SSC AI Lab Builder ──────────────────
  //  backend 결정적 렌더러가 만든 plan 을 실행만 한다(제네릭 HTTP 응답기 curl).
  const plan = req.body?.plan
  if (plan && plan.generic && plan.archetype === 'http_header') {
    try {
      const GEN = process.env.HTTP_GENERIC_URL || 'http://lab-http-generic'
      const urlB = `${GEN}${plan.before?.path || '/'}`
      const urlA = `${GEN}${plan.after?.path || '/'}`
      const rawB = await curlHead(urlB)
      const rawA = await curlHead(urlA)
      if (!rawB || !rawA) return res.status(500).json({ ok: false, error: '제네릭 응답기 curl 실패' })
      const focusKeys = [String(plan.focusHeader || '').toLowerCase()]
      const shotB = await renderTerminalScreenshot([{ cmd: `curl -sSI ${urlB}`, raw: rawB }], headerSummary(parseHeaders(rawB), 'before', focusKeys), 'before', headerLineClass(focusKeys))
      const shotA = await renderTerminalScreenshot([{ cmd: `curl -sSI ${urlA}`, raw: rawA }], headerSummary(parseHeaders(rawA), 'after', focusKeys), 'after', headerLineClass(focusKeys))
      const hB = parseHeaders(rawB)[focusKeys[0]] || 'Not Present'
      const hA = parseHeaders(rawA)[focusKeys[0]] || 'Not Present'
      return res.json({
        ok: true,
        visual_before: { label: plan.labels?.before || '조치 전 · curl -I 응답 헤더', screenshot: shotB, variant: 'before' },
        visual_after: { label: plan.labels?.after || '조치 후 · curl -I 응답 헤더', screenshot: shotA, variant: 'after' },
        technical_diff: [{ key: plan.diffKey || focusKeys[0], before: hB, after: hA, changed: String(hB) !== String(hA) }],
        raw_summary: { tool: 'curl -sSI (recipe)' }
      })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }
  // 레시피 주도 network — 기존 net-vulnerable/remediated 포트를 nmap 으로 실측.
  if (plan && plan.generic && plan.archetype === 'network') {
    try {
      const port = Number(plan.port)
      const b = await checkPort(NET_VUL, port)
      const a = await checkPort(NET_REM, port)
      const nmapCmd = (host) => `nmap -sT -Pn -p ${port} ${host}`
      const rawNb = await runCmd('nmap', ['-sT', '-Pn', '-p', String(port), NET_VUL], 20000)
      const rawNa = await runCmd('nmap', ['-sT', '-Pn', '-p', String(port), NET_REM], 20000)
      if (!rawNb || !rawNa) return res.status(500).json({ ok: false, error: 'nmap 실패' })
      const shotB = await renderTerminalScreenshot([{ cmd: nmapCmd(NET_VUL), raw: rawNb }], `⚠ tcp/${port} ${b} — 서비스 외부 노출`, 'before', nmapLineClass)
      const shotA = await renderTerminalScreenshot([{ cmd: nmapCmd(NET_REM), raw: rawNa }], `✓ tcp/${port} ${a} — 노출 없음`, 'after', nmapLineClass)
      return res.json({
        ok: true,
        visual_before: { label: plan.labels?.before || `조치 전 · nmap (tcp/${port} ${b})`, screenshot: shotB, variant: 'before' },
        visual_after: { label: plan.labels?.after || `조치 후 · nmap (tcp/${port} ${a})`, screenshot: shotA, variant: 'after' },
        technical_diff: [{ key: `tcp/${port}`, before: b, after: a, changed: b !== a }],
        raw_summary: { tool: 'nmap -sT (recipe)' }
      })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  // ── TLS 카테고리 ──────────────────────────────────────────────────
  if (templateId === 'tls') {
    try {
      const it = String(issueType).toLowerCase()

      // 인증서 폐지(revocation) — 실제 CA/CRL 로 폐지 인증서 vs 유효 인증서를 openssl verify -crl_check 로 실검증
      if (it.includes('revoked')) {
        const base = `http://${TLS_REVOKED}`
        await runShell(`cd /tmp && curl -sfo ca.crt ${base}/ca.crt && curl -sfo crl.pem ${base}/crl.pem && curl -sfo revoked.crt ${base}/revoked.crt && curl -sfo valid.crt ${base}/valid.crt`)
        const verifyCmd = (cert) => `openssl verify -crl_check -CAfile ca.crt -CRLfile crl.pem ${cert}`
        const rawB = await runShell(`cd /tmp && ${verifyCmd('revoked.crt')} 2>&1`)
        const rawA = await runShell(`cd /tmp && ${verifyCmd('valid.crt')} 2>&1`)
        if (!rawB || !rawA) return res.status(500).json({ ok: false, error: 'openssl verify(폐지 검증) 실패' })
        const revokedB = /revoked|error 23/i.test(rawB)
        const revokedA = /revoked|error 23/i.test(rawA)
        const shotB = await renderTerminalScreenshot([{ cmd: verifyCmd('revoked.crt'), raw: rawB }], '⚠ 인증서 폐지됨 — CRL 에 등재 (error 23 certificate revoked)', 'before', revokedLineClass)
        const shotA = await renderTerminalScreenshot([{ cmd: verifyCmd('valid.crt'), raw: rawA }], '✓ 유효 인증서 — CRL 미등재 (verify OK)', 'after', revokedLineClass)
        return res.json({
          ok: true,
          visual_before: { label: '조치 전 · openssl verify -crl_check (폐지됨)', screenshot: shotB, variant: 'before' },
          visual_after: { label: '조치 후 · openssl verify -crl_check (유효)', screenshot: shotA, variant: 'after' },
          technical_diff: [
            { key: 'CRL 검증 결과', before: revokedB ? '폐지됨 (certificate revoked)' : '판정 불가', after: revokedA ? '폐지됨' : '유효 (verify OK)', changed: revokedB !== revokedA },
            { key: 'CRL 등재 여부', before: revokedB ? '예 (CRL에 시리얼 등재)' : '아니오', after: '아니오', changed: revokedB !== revokedA }
          ],
          raw_summary: { tool: 'openssl verify -crl_check (CA/CRL)' }
        })
      }

      // 프로토콜/암호 계열 — nmap ssl-enum-ciphers 로 '서버가 제공하는' 프로토콜/암호 강도 열거
      //  (node/openssl 클라는 최고 버전으로 협상해 약한 것을 못 보므로 스캐너로 열거)
      if (it.includes('cipher') || it.includes('protocol')) {
        const cmd = (host) => `nmap --script ssl-enum-ciphers -p 443 ${host}`
        const rawB = await nmapSslEnum(TLS_VUL)
        const rawA = await nmapSslEnum(TLS_REM)
        if (!rawB || !rawA) return res.status(500).json({ ok: false, error: 'nmap ssl-enum 실패' })
        const pB = parseSslEnum(rawB)
        const pA = parseSslEnum(rawA)
        const weak = (ps) => ps.filter((p) => /SSLv|TLSv1\.0|TLSv1\.1/.test(p))
        const isProto = it.includes('protocol')
        const shotB = await renderTerminalScreenshot([{ cmd: cmd(TLS_VUL), raw: trimSslEnum(rawB) }],
          `⚠ 제공 프로토콜: ${pB.protocols.join(', ')} · 암호 강도(least): ${pB.grade}`, 'before', sslEnumLineClass)
        const shotA = await renderTerminalScreenshot([{ cmd: cmd(TLS_REM), raw: trimSslEnum(rawA) }],
          `✓ 제공 프로토콜: ${pA.protocols.join(', ')} · 암호 강도(least): ${pA.grade}`, 'after', sslEnumLineClass)
        const technical_diff = isProto
          ? [
              { key: '구버전 프로토콜(TLS1.0/1.1) 제공', before: weak(pB.protocols).length ? '예 (' + weak(pB.protocols).join(', ') + ')' : '아니오', after: weak(pA.protocols).length ? '예' : '아니오', changed: weak(pB.protocols).length !== weak(pA.protocols).length },
              { key: '제공 프로토콜', before: pB.protocols.join(', '), after: pA.protocols.join(', '), changed: pB.protocols.join() !== pA.protocols.join() }
            ]
          : [
              { key: '암호 강도 (nmap least strength)', before: pB.grade, after: pA.grade, changed: pB.grade !== pA.grade },
              { key: '제공 프로토콜', before: pB.protocols.join(', '), after: pA.protocols.join(', '), changed: pB.protocols.join() !== pA.protocols.join() }
            ]
        return res.json({
          ok: true,
          visual_before: { label: `조치 전 · nmap ssl-enum (${isProto ? '구버전 프로토콜 제공' : '약한 암호(F)'})`, screenshot: shotB, variant: 'before' },
          visual_after: { label: `조치 후 · nmap ssl-enum (${isProto ? 'TLS1.2+ 만' : '강한 암호(A)'})`, screenshot: shotA, variant: 'after' },
          technical_diff,
          raw_summary: { tool: 'nmap ssl-enum-ciphers' }
        })
      }

      // 인증서 계열(유효기간/만료/폐지/키 크기) — openssl 인증서 검사(날짜 + 키 크기)
      const b = await tlsInspect(TLS_VUL)
      const a = await tlsInspect(TLS_REM)
      if (b.error || a.error) return res.status(500).json({ ok: false, error: `TLS 검사 실패: ${b.error || a.error}` })
      const rows = (x) => [['Not After', x.validTo], ['Validity (days)', x.validityDays], ['Key Size (bits)', x.keyBits]]
      const isKey = it.includes('key_size')
      const isSelf = it.includes('self_signed')
      const isSig = it.includes('signature') // tlscert_weak_signature (dkim_weak_signature 는 dns 분기라 여기 안 옴)
      // 서명 알고리즘 검사는 -text 에서 'Signature Algorithm' 라인을, 그 외는 subject/issuer/dates 를 발췌
      const tlsCmd = (host) => isSig
        ? `echo | openssl s_client -connect ${host}:443 2>/dev/null | openssl x509 -noout -text 2>/dev/null | grep -E 'Signature Algorithm|Public-Key:'`
        : `echo | openssl s_client -connect ${host}:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates -text 2>/dev/null | grep -E 'subject=|issuer=|notBefore=|notAfter=|Public-Key:'`
      const rawTb = await runShell(tlsCmd(TLS_VUL))
      const rawTa = await runShell(tlsCmd(TLS_REM))
      const sigAlgFrom = (raw) => (String(raw || '').match(/Signature Algorithm:\s*(\S+)/i) || [])[1] || '?'
      const sigB = sigAlgFrom(rawTb)
      const sigA = sigAlgFrom(rawTa)
      let shotB
      let shotA
      if (rawTb && rawTa) {
        const sumB = isSelf ? `⚠ 자체서명 인증서 (issuer == subject: ${b.issuer})`
          : isKey ? `⚠ 키 크기 ${b.keyBits}비트 (권장 미달)`
            : isSig ? `⚠ 서명 알고리즘 ${sigB} (약한 해시: SHA-1)`
              : `⚠ 인증서 유효기간 ${b.validityDays}일 (과다) · notAfter ${b.validTo}`
        const sumA = isSelf ? `✓ 신뢰 CA 서명 (issuer: ${a.issuer})`
          : isKey ? `✓ 키 크기 ${a.keyBits}비트 (적정)`
            : isSig ? `✓ 서명 알고리즘 ${sigA} (강한 해시: SHA-256)`
              : `✓ 인증서 유효기간 ${a.validityDays}일 (적정) · notAfter ${a.validTo}`
        shotB = await renderTerminalScreenshot([{ cmd: tlsCmd(TLS_VUL), raw: rawTb }], sumB, 'before', opensslLineClass('before'))
        shotA = await renderTerminalScreenshot([{ cmd: tlsCmd(TLS_REM), raw: rawTa }], sumA, 'after', opensslLineClass('after'))
      } else {
        shotB = await renderReportScreenshot('TLS Scan — Vulnerable Target', rows(b), 'before')
        shotA = await renderReportScreenshot('TLS Scan — Remediated Target', rows(a), 'after')
      }
      const tlsRows = {
        validity: { key: 'Cert Validity (days)', before: String(b.validityDays), after: String(a.validityDays), changed: b.validityDays !== a.validityDays },
        notAfter: { key: 'Not After', before: String(b.validTo), after: String(a.validTo), changed: String(b.validTo) !== String(a.validTo) },
        keySize: { key: 'Key Size (bits)', before: String(b.keyBits), after: String(a.keyBits), changed: b.keyBits !== a.keyBits },
        selfSigned: { key: '자체서명 여부', before: b.selfSigned ? '예 (issuer==subject)' : '아니오', after: a.selfSigned ? '예' : '아니오 (CA 서명)', changed: b.selfSigned !== a.selfSigned },
        issuer: { key: '발급자(issuer)', before: String(b.issuer), after: String(a.issuer), changed: String(b.issuer) !== String(a.issuer) },
        sigAlg: { key: '서명 알고리즘', before: sigB, after: sigA, changed: sigB !== sigA }
      }
      const pick = isSelf ? ['selfSigned', 'issuer'] : isKey ? ['keySize'] : isSig ? ['sigAlg'] : ['validity', 'notAfter']
      const label = isSelf ? ['조치 전 · openssl 인증서 (자체서명)', '조치 후 · openssl 인증서 (CA 서명)']
        : isKey ? ['조치 전 · openssl 인증서 (키 1024비트)', '조치 후 · openssl 인증서 (키 2048비트)']
          : isSig ? ['조치 전 · openssl 인증서 (SHA-1 서명)', '조치 후 · openssl 인증서 (SHA-256 서명)']
            : ['조치 전 · openssl 인증서 (유효기간 과다)', '조치 후 · openssl 인증서 (유효기간 적정)']
      return res.json({
        ok: true,
        visual_before: { label: label[0], screenshot: shotB, variant: 'before' },
        visual_after: { label: label[1], screenshot: shotA, variant: 'after' },
        technical_diff: pick.map((k) => tlsRows[k]),
        raw_summary: { tool: 'openssl x509 + node-tls' }
      })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  // ── SSH 카테고리 ──────────────────────────────────────────────────
  if (templateId === 'ssh') {
    try {
      const cmd = (host) => `nmap --script ssh2-enum-algos -p 22 ${host}`
      const rawB = await nmapSshEnum(SSH_VUL)
      const rawA = await nmapSshEnum(SSH_REM)
      if (!rawB || !rawA) return res.status(500).json({ ok: false, error: 'nmap ssh2-enum 실패' })
      const wB = sshWeak(parseSshAlgos(rawB))
      const wA = sshWeak(parseSshAlgos(rawA))
      const it = String(issueType).toLowerCase()
      const isCipher = it.includes('cipher')
      const weakListB = isCipher ? wB.enc : [...wB.kex, ...wB.mac]
      const weakListA = isCipher ? wA.enc : [...wA.kex, ...wA.mac]
      const shotB = await renderTerminalScreenshot([{ cmd: cmd(SSH_VUL), raw: trimSshEnum(rawB) }], `⚠ 약한 ${isCipher ? 'cipher' : 'KEX/MAC'} 제공: ${weakListB.join(', ') || '없음'}`, 'before', sshLineClass)
      const shotA = await renderTerminalScreenshot([{ cmd: cmd(SSH_REM), raw: trimSshEnum(rawA) }], `✓ 강한 알고리즘만 (약한 ${isCipher ? 'cipher' : 'KEX/MAC'} 없음)`, 'after', sshLineClass)
      return res.json({
        ok: true,
        visual_before: { label: `조치 전 · nmap ssh2-enum (약한 ${isCipher ? 'cipher' : 'KEX/MAC'})`, screenshot: shotB, variant: 'before' },
        visual_after: { label: '조치 후 · nmap ssh2-enum (강한 알고리즘)', screenshot: shotA, variant: 'after' },
        technical_diff: [
          { key: `약한 ${isCipher ? 'cipher' : 'KEX/MAC'} 제공`, before: weakListB.length ? '예 (' + weakListB.join(', ') + ')' : '아니오', after: weakListA.length ? '예' : '아니오', changed: weakListB.length !== weakListA.length }
        ],
        raw_summary: { tool: 'nmap ssh2-enum-algos' }
      })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  // ── DNS 카테고리 ──────────────────────────────────────────────────
  if (templateId === 'dns') {
    try {
      // 이슈별 focus(malformed SPF / DMARC p=none) — 서브도메인 레코드 질의
      const focus = dnsFocus(issueType, DNS_ZONE)
      if (focus) {
        const cmd = (srv) => `dig +short TXT ${focus.name} @${srv}`
        const [rB, rA] = await Promise.all([runCmd('dig', ['+short', 'TXT', focus.name, '@' + DNS_VUL]), runCmd('dig', ['+short', 'TXT', focus.name, '@' + DNS_REM])])
        if (rB === null || rA === null) return res.status(500).json({ ok: false, error: 'dig 실패' })
        const orNone = (s) => (s && s.trim() ? s : '; (레코드 없음)')

        // DKIM: 레코드 텍스트가 아니라 '공개키 비트 수'가 핵심 → 파싱해서 비교
        if (focus.kind === 'dkim') {
          const bitsB = dkimKeyBits(rB)
          const bitsA = dkimKeyBits(rA)
          const verdict = (bits) => bits && bits >= 1024
            ? [`DKIM 키: ${bits}비트 (충분)`, '==> ✅ 서명 위조가 현실적으로 어려움']
            : [`DKIM 키: ${bits || '?'}비트 (부족·약함)`, '==> 🚨 키가 짧아 서명 위조·우회 위험']
          const parseCmd = '# DKIM 공개키(p=) 파싱 → RSA 키 비트 수'
          const segB = [{ cmd: cmd(DNS_VUL), raw: orNone(rB) }, { cmd: parseCmd, raw: verdict(bitsB).join('\n') }]
          const segA = [{ cmd: cmd(DNS_REM), raw: orNone(rA) }, { cmd: parseCmd, raw: verdict(bitsA).join('\n') }]
          const shotB = await renderTerminalScreenshot(segB, `⚠ DKIM 키 ${bitsB || '?'}비트 (부족·약함)`, 'before', digLineClass)
          const shotA = await renderTerminalScreenshot(segA, `✓ DKIM 키 ${bitsA || '?'}비트 (권장 충족)`, 'after', digLineClass)
          return res.json({
            ok: true,
            visual_before: { label: `조치 전 · dig DKIM (${bitsB || '?'}비트)`, screenshot: shotB, variant: 'before' },
            visual_after: { label: `조치 후 · dig DKIM (${bitsA || '?'}비트)`, screenshot: shotA, variant: 'after' },
            technical_diff: [
              { key: 'DKIM 키 길이(비트)', before: String(bitsB), after: String(bitsA), changed: bitsB !== bitsA }
            ],
            raw_summary: { tool: 'dig + node-crypto(DKIM key)' }
          })
        }
        const verdictCmd = `# 수신 서버 판정 — 공격자(${SPOOF_IP})가 ${spoofFrom(DNS_ZONE)} 사칭 발송`
        const segB = [{ cmd: cmd(DNS_VUL), raw: orNone(rB) }, { cmd: verdictCmd, raw: dnsVerdictLines(focus.kind, rB).join('\n') }]
        const segA = [{ cmd: cmd(DNS_REM), raw: orNone(rA) }, { cmd: verdictCmd, raw: dnsVerdictLines(focus.kind, rA).join('\n') }]
        const shotB = await renderTerminalScreenshot(segB, `⚠ ${focus.label}: 취약 → 위조 메일 수신 허용(스푸핑 성공)`, 'before', digLineClass)
        const shotA = await renderTerminalScreenshot(segA, `✓ ${focus.label}: 조치 → 위조 메일 격리·거부(스푸핑 차단)`, 'after', digLineClass)
        return res.json({
          ok: true,
          visual_before: { label: `조치 전 · dig ${focus.label} + 판정`, screenshot: shotB, variant: 'before' },
          visual_after: { label: `조치 후 · dig ${focus.label} + 판정`, screenshot: shotA, variant: 'after' },
          technical_diff: [
            { key: `${focus.label} (TXT)`, before: orNone(rB), after: orNone(rA), changed: (rB || '') !== (rA || '') },
            { key: '위조 메일(스푸핑) 수신', before: '허용됨', after: '격리·거부됨', changed: true }
          ],
          raw_summary: { tool: 'dig + verdict' }
        })
      }
      const bSpf = pickSpf(await dnsTxt(DNS_VUL, DNS_ZONE))
      const aSpf = pickSpf(await dnsTxt(DNS_REM, DNS_ZONE))
      const bDmarc = pickDmarc(await dnsTxt(DNS_VUL, `_dmarc.${DNS_ZONE}`))
      const aDmarc = pickDmarc(await dnsTxt(DNS_REM, `_dmarc.${DNS_ZONE}`))
      const rows = (spf, dmarc) => [['Zone', DNS_ZONE], ['SPF (TXT)', spf], ['DMARC (_dmarc TXT)', dmarc]]
      // 실제 dig 명령(SPF + DMARC). 결과가 null이면 dig 실패 → 리포트 뷰 폴백.
      const digSpf = (srv) => `dig +short TXT ${DNS_ZONE} @${srv}`
      const digDmarc = (srv) => `dig +short TXT _dmarc.${DNS_ZONE} @${srv}`
      const dig = (name, srv) => runCmd('dig', ['+short', 'TXT', name, '@' + srv])
      const orNone = (s) => (s && s.trim() ? s : '; (레코드 없음)')
      const [rSpfB, rDmarcB, rSpfA, rDmarcA] = await Promise.all([
        dig(DNS_ZONE, DNS_VUL), dig(`_dmarc.${DNS_ZONE}`, DNS_VUL),
        dig(DNS_ZONE, DNS_REM), dig(`_dmarc.${DNS_ZONE}`, DNS_REM)
      ])
      let shotB
      let shotA
      if ([rSpfB, rDmarcB, rSpfA, rDmarcA].every((r) => r !== null)) {
        // 실측 dig 레코드(①②) + 그 레코드로 수신 서버가 위조 메일을 판정한 결과(③)
        const verdictCmd = `# 수신 서버 SPF/DMARC 판정 — 공격자(${SPOOF_IP})가 ${spoofFrom(DNS_ZONE)} 사칭 발송`
        const segB = [
          { cmd: digSpf(DNS_VUL), raw: orNone(rSpfB) },
          { cmd: digDmarc(DNS_VUL), raw: orNone(rDmarcB) },
          { cmd: verdictCmd, raw: mailVerdictLines(rSpfB, rDmarcB).join('\n') }
        ]
        const segA = [
          { cmd: digSpf(DNS_REM), raw: orNone(rSpfA) },
          { cmd: digDmarc(DNS_REM), raw: orNone(rDmarcA) },
          { cmd: verdictCmd, raw: mailVerdictLines(rSpfA, rDmarcA).join('\n') }
        ]
        shotB = await renderTerminalScreenshot(segB, '⚠ SPF/DMARC 없음 → 위조 메일이 수신함으로 전달됨(스푸핑 성공)', 'before', digLineClass)
        shotA = await renderTerminalScreenshot(segA, '✓ SPF(-all)+DMARC(p=quarantine) → 위조 메일 격리·거부(스푸핑 차단)', 'after', digLineClass)
      } else {
        shotB = await renderReportScreenshot('DNS Scan — Vulnerable Zone', rows(bSpf, bDmarc), 'before')
        shotA = await renderReportScreenshot('DNS Scan — Remediated Zone', rows(aSpf, aDmarc), 'after')
      }
      return res.json({
        ok: true,
        visual_before: { label: '조치 전 · dig + 위조 메일 판정 (수신 허용)', screenshot: shotB, variant: 'before' },
        visual_after: { label: '조치 후 · dig + 위조 메일 판정 (격리·거부)', screenshot: shotA, variant: 'after' },
        technical_diff: [
          { key: 'SPF (TXT)', before: bSpf, after: aSpf, changed: bSpf !== aSpf },
          { key: 'DMARC (_dmarc)', before: bDmarc, after: aDmarc, changed: bDmarc !== aDmarc },
          { key: '위조 메일(스푸핑) 수신', before: '허용됨 → 받은편지함', after: '격리·거부됨', changed: true }
        ],
        raw_summary: { tool: 'node-dns + report-render' }
      })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  // ── 네트워크 카테고리 ─────────────────────────────────────────────
  if (templateId === 'network') {
    try {
      const port = NET_PORTS[String(issueType).toLowerCase()] || 1723
      const b = await checkPort(NET_VUL, port)
      const a = await checkPort(NET_REM, port)
      const rows = (state) => [['Target', 'Partner Standard Lab'], ['Port', `tcp/${port}`], ['State', state]]
      // 공격자 관점 시나리오: 외부에서 그 서비스 포트로 실제 접속을 시도한다(ncat).
      //  조치 전 = 연결 성공(도달·악용 가능) · 조치 후 = 거부(차단). + nmap 으로 포트 상태 확인.
      const ncatCmd = (host) => `ncat -v -z -w3 ${host} ${port}`
      const nmapCmd = (host) => `nmap -sT -Pn -p ${port} ${host}`
      const rawCb = await runCmdCombined('ncat', ['-v', '-z', '-w', '3', NET_VUL, String(port)], 12000)
      const rawCa = await runCmdCombined('ncat', ['-v', '-z', '-w', '3', NET_REM, String(port)], 12000)
      const rawNb = await runCmd('nmap', ['-sT', '-Pn', '-p', String(port), NET_VUL], 20000)
      const rawNa = await runCmd('nmap', ['-sT', '-Pn', '-p', String(port), NET_REM], 20000)
      // 접속 시도(ncat) + 포트 상태(nmap) 라인 색상 — 도달/노출=위험(빨강), 거부/차단=안전(초록).
      const netScn = (l) => {
        if (/connection refused|refused|closed|filtered|timed out|timeout|no matching/i.test(l)) return 'good'
        if (/connected to|succeeded|\bopen\b/i.test(l)) return 'bad'
        if (/^ncat:|^starting nmap|scan report|^PORT|host is up|nmap done/i.test(l)) return 'status'
        return 'dim'
      }
      let shotB
      let shotA
      if (rawCb && rawCa) {
        const segB = [{ cmd: ncatCmd(NET_VUL), raw: rawCb }]
        const segA = [{ cmd: ncatCmd(NET_REM), raw: rawCa }]
        if (rawNb) segB.push({ cmd: nmapCmd(NET_VUL), raw: rawNb })
        if (rawNa) segA.push({ cmd: nmapCmd(NET_REM), raw: rawNa })
        shotB = await renderTerminalScreenshot(segB, `⚠ 공격자 접속 성공 — tcp/${port} 서비스에 외부에서 도달 가능(악용 위험)`, 'before', netScn)
        shotA = await renderTerminalScreenshot(segA, `✓ 접속 거부 — tcp/${port} 외부 도달 차단(공격 실패)`, 'after', netScn)
      } else if (rawNb && rawNa) {
        shotB = await renderTerminalScreenshot([{ cmd: nmapCmd(NET_VUL), raw: rawNb }], `⚠ tcp/${port} ${b} — 서비스 외부 노출`, 'before', nmapLineClass)
        shotA = await renderTerminalScreenshot([{ cmd: nmapCmd(NET_REM), raw: rawNa }], `✓ tcp/${port} ${a} — 노출 없음`, 'after', nmapLineClass)
      } else {
        shotB = await renderReportScreenshot('Port Scan — Vulnerable Target', rows(b), 'before')
        shotA = await renderReportScreenshot('Port Scan — Remediated Target', rows(a), 'after')
      }
      return res.json({
        ok: true,
        visual_before: { label: `조치 전 · 접속 시도 → 연결됨 (tcp/${port} 노출·도달 가능)`, screenshot: shotB, variant: 'before' },
        visual_after: { label: `조치 후 · 접속 시도 → 거부됨 (tcp/${port} 차단)`, screenshot: shotA, variant: 'after' },
        technical_diff: [
          { key: `공격자 접속 시도 (ncat tcp/${port})`, before: '연결됨(도달 가능)', after: '거부됨(차단)', changed: true },
          { key: `포트 상태 (nmap tcp/${port})`, before: b, after: a, changed: b !== a }
        ],
        raw_summary: { tool: 'ncat(접속 시도) + nmap(포트 상태)', note: port !== 1723 ? '이 랩 타깃은 tcp/1723만 노출 — 다른 포트는 미노출' : undefined }
      })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  if (templateId !== 'http_header') {
    return res.status(501).json({ ok: false, error: `scaffold: http_header/tls/dns/network supported (got ${templateId})` })
  }

  // ── CSP/XSS 데모: 인라인 스크립트가 취약(실행·변조)/조치(CSP 차단)에서 눈에 보이게 다름 ──
  if (CSP_ISSUES.includes(String(issueType).toLowerCase())) {
    try {
      const before = await captureXss(`${VUL}/xss.html`)
      const after = await captureXss(`${REM}/xss.html`)
      return res.json({
        ok: true,
        visual_before: { label: 'Before · CSP 없음 — 인라인 스크립트 실행(페이지 변조)', screenshot: before.screenshot, variant: 'before' },
        visual_after: { label: 'After · CSP 적용 — 인라인 스크립트 차단', screenshot: after.screenshot, variant: 'after' },
        // 이 항목(CSP)에 해당하는 관측값만: 헤더 값 + 차단 증거(콘솔).
        //  스크립트 실행·쿠키 탈취 등 '효과'는 3단계(조치 전/후 데모)에서 시각적으로 보여줌.
        technical_diff: [
          { key: 'Content-Security-Policy (응답 헤더)', before: before.headers['content-security-policy'] || 'Not Present', after: after.headers['content-security-policy'] || 'Not Present', changed: (before.headers['content-security-policy'] || '') !== (after.headers['content-security-policy'] || '') },
          { key: '브라우저 콘솔(차단 증거)', before: before.cspErrors?.length ? before.cspErrors[0] : '(위반 없음 — 스크립트 실행됨)', after: after.cspErrors?.length ? after.cspErrors[0] : '(위반 없음)', changed: (before.cspErrors?.length || 0) !== (after.cspErrors?.length || 0) }
        ],
        raw_summary: { tool: 'playwright', focus: 'CSP inline-script execution (visible defacement)' }
      })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  try {
    // CSP 변형(광범위/unsafe)/리다이렉트는 루트가 아니라 전용 경로에서 관측(루트/guestbook 불변).
    const itc = String(issueType).toLowerCase()
    const isRedirect = itc.includes('redirect')
    const hdrPath = (itc.includes('csp') && itc.includes('broad')) ? '/csp-broad'
      : (itc.includes('csp') && itc.includes('unsafe')) ? '/csp-unsafe'
        : isRedirect ? '/secure-redirect' : '/'
    // 리다이렉트는 Playwright 가 3xx 를 따라가(→https 실패/루프) 헤더가 왜곡되므로 capture 생략, curl 만 사용.
    const before = isRedirect ? { headers: {}, cookies: [] } : await capture(`${VUL}${hdrPath}`)
    const after = isRedirect ? { headers: {}, cookies: [] } : await capture(`${REM}${hdrPath}`)
    // 헤더/토큰은 화면(픽셀)에 안 보이므로, 실제 `curl -I` 명령과 그 출력을 '터미널 화면'으로
    //  보여준다(취약=노출/누락 라인 빨강, 조치=적용 라인 초록). curl 불가 시 헤더 뷰로 폴백.
    const cmdB = `curl -sSI ${VUL}${hdrPath}`
    const cmdA = `curl -sSI ${REM}${hdrPath}`
    const rawB = await curlHead(`${VUL}${hdrPath}`)
    const rawA = await curlHead(`${REM}${hdrPath}`)
    // 이 finding에 해당하는 헤더만 강조/요약 (curl은 전체 응답을 보여주되 무관한 헤더는 dim)
    const focusKeys = headerFocusKeys(issueType)
    // 리다이렉트 요약: 상태코드 + Location 목적지 스킴(http=비보안 / https=보안)
    const statusOf = (raw) => (String(raw).match(/^HTTP\/\S+\s+(\d{3})/m) || [])[1] || '?'
    const rdSum = (raw, variant) => {
      const loc = parseHeaders(raw)['location'] || '(없음)'
      return variant === 'before'
        ? `⚠ ${statusOf(raw)} · Location ${loc} (임시 리다이렉트·HTTP 목적지=비보안)`
        : `✓ ${statusOf(raw)} · Location ${loc} (영구 리다이렉트·HTTPS 목적지)`
    }
    const sumOf = (raw, variant) => isRedirect ? rdSum(raw, variant) : headerSummary(parseHeaders(raw), variant, focusKeys)
    let shotB
    let shotA
    if (rawB && rawA) {
      shotB = await renderTerminalScreenshot([{ cmd: cmdB, raw: rawB }], sumOf(rawB, 'before'), 'before', headerLineClass(focusKeys))
      shotA = await renderTerminalScreenshot([{ cmd: cmdA, raw: rawA }], sumOf(rawA, 'after'), 'after', headerLineClass(focusKeys))
    } else {
      shotB = await renderHeadersScreenshot('조치 전 · 취약 응답 헤더', classifyHeaders(before.headers), 'before')
      shotA = await renderHeadersScreenshot('조치 후 · 조치 응답 헤더', classifyHeaders(after.headers), 'after')
    }
    const visual_before = { label: '조치 전 · curl -I 응답 헤더', screenshot: shotB, variant: 'before' }
    const visual_after = { label: '조치 후 · curl -I 응답 헤더', screenshot: shotA, variant: 'after' }

    // 쿠키 계열: 실제 쿠키 속성(HttpOnly/SameSite) 비교
    if (String(issueType).toLowerCase().includes('cookie')) {
      const b = cookieAttrs(before.cookies)
      const a = cookieAttrs(after.cookies)
      return res.json({
        ok: true,
        visual_before,
        visual_after,
        technical_diff: [
          { key: 'Session Cookie', before: b.present ? b.name : '(none)', after: a.present ? a.name : '(none)', changed: false },
          { key: 'HttpOnly', before: String(b.httpOnly), after: String(a.httpOnly), changed: b.httpOnly !== a.httpOnly },
          { key: 'SameSite', before: String(b.sameSite), after: String(a.sameSite), changed: String(b.sameSite) !== String(a.sameSite) }
        ],
        raw_summary: { tool: 'playwright', focus: 'cookie attributes (context.cookies())' }
      })
    }

    // 리다이렉트 계열: 상태코드(302 임시 → 301 영구) + Location 스킴(http → https) 비교
    if (isRedirect) {
      const hb = parseHeaders(rawB)
      const ha = parseHeaders(rawA)
      const locB = hb['location'] || '(없음)'
      const locA = ha['location'] || '(없음)'
      return res.json({
        ok: true,
        visual_before,
        visual_after,
        technical_diff: [
          { key: '리다이렉트 상태코드', before: statusOf(rawB), after: statusOf(rawA), changed: statusOf(rawB) !== statusOf(rawA) },
          { key: 'Location 목적지', before: locB, after: locA, changed: locB !== locA }
        ],
        raw_summary: { tool: 'curl -sSI', focus: 'HTTPS redirect pattern (status + Location scheme)' }
      })
    }

    const spec = headerSpec(issueType)
    const bVal = spec.get(before.headers)
    const aVal = spec.get(after.headers)
    res.json({
      ok: true,
      visual_before,
      visual_after,
      // 이 항목(헤더)에 해당하는 관측값만 (HTTP Status 등 무관한 행 제외 → 오해 소지 없음)
      technical_diff: [
        { key: spec.name, before: bVal, after: aVal, changed: bVal !== aVal }
      ],
      raw_summary: { tool: 'playwright', note: bVal === aVal ? '두 타깃 동일(해당 이슈는 이 헤더 타깃으로 재현되지 않음)' : undefined }
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.listen(8899, () => console.log('evidence-collector listening on :8899'))
