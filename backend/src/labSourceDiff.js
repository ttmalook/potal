// =====================================================================
// Lab Source Diff — 랩 타깃의 "실제 설정 파일" 취약/조치 원문 비교
//  - sandboxCatalog 의 configDiff(예시 스니펫)와 달리, 이건 검증랩이 실제로
//    세운 취약 타깃 ↔ 조치 타깃의 설정 파일 원문(lab/targets/*)을 읽어 diff.
//  - runLab 에서 호출해 run.sourceDiff 로 부착. 프론트 ConfigDiff 가 그대로 렌더.
//  - 반환 shape 는 sandboxCatalog 의 D()와 동일: { label, file, language, real, lines:[{t,s}] }
// =====================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// backend/src → repo/claude/lab/targets
const TARGETS = path.join(__dirname, '..', '..', 'lab', 'targets')

// 네트워크 issue_type → 표준 포트 (collector NET_PORTS 와 일치)
const NET_PORT = {
  service_pptp: 1723, open_port: 1723, insecure_telnet: 23, service_telnet: 23, insecure_ftp: 21, service_ftp: 21,
  service_rdp: 3389, service_vnc: 5900, service_dns: 53, service_imap: 143, service_ldap: 389, service_ldap_anonymous: 389,
  service_smb: 445, service_mysql: 3306, service_redis: 6379, service_mongodb: 27017, service_elasticsearch: 9200,
  service_couchdb: 5984, service_cassandra: 9042, service_http_proxy: 8080
}

// template/issueType → 실제 취약/조치 설정 파일 쌍 (또는 inline 정의)
function sourceSpec(templateId, issueType) {
  const t = String(issueType || '').toLowerCase()
  switch (templateId) {
    case 'http_header':
      // CSP 변형(광범위/unsafe)은 전용 location 의 add_header 한 줄만 대상 → inline 으로 정확히 표현.
      if (t.includes('csp') && t.includes('broad')) {
        return {
          label: 'CSP 지시자 범위 (nginx)', file: 'conf.d/default.conf (location = /csp-broad)', language: 'nginx',
          inline: {
            before: '# 취약: 광범위 지시자 — 모든 출처 허용\nadd_header Content-Security-Policy "default-src * data: blob: \'unsafe-inline\'" always;',
            after: '# 조치: 출처를 자기 자신으로 제한\nadd_header Content-Security-Policy "default-src \'self\'; object-src \'none\'" always;'
          }
        }
      }
      if (t.includes('csp') && t.includes('unsafe')) {
        return {
          label: 'CSP unsafe-* 지시자 (nginx)', file: 'conf.d/default.conf (location = /csp-unsafe)', language: 'nginx',
          inline: {
            before: '# 취약: unsafe-inline/eval 허용 — CSP 있어도 인라인 XSS 실행 가능\nadd_header Content-Security-Policy "default-src \'self\'; script-src \'self\' \'unsafe-inline\' \'unsafe-eval\'" always;',
            after: '# 조치: unsafe-* 제거\nadd_header Content-Security-Policy "default-src \'self\'; script-src \'self\'" always;'
          }
        }
      }
      if (t.includes('redirect')) {
        return {
          label: 'HTTPS 리다이렉트 (nginx)', file: 'conf.d/default.conf (location = /secure-redirect)', language: 'nginx',
          inline: {
            before: '# 취약: 302(임시) + HTTP 목적지 — 암호화되지 않은 곳으로 유도\nreturn 302 http://$host/dashboard;',
            after: '# 조치: 301(영구) + HTTPS 목적지\nreturn 301 https://$host/dashboard;'
          }
        }
      }
      return {
        label: '웹서버 보안 헤더 설정 (nginx)',
        file: 'conf.d/default.conf',
        language: 'nginx',
        before: path.join(TARGETS, 'http-vulnerable', 'default.conf'),
        after: path.join(TARGETS, 'http-remediated', 'default.conf')
      }
    case 'tls':
      if (t.includes('revoked')) {
        return {
          label: '인증서 폐지 상태 (CA/CRL)', file: '인증서 발급/폐지', language: 'text',
          inline: {
            before: '# 취약: CA가 이 인증서를 폐지 → CRL 에 등재됨\nopenssl ca -revoke revoked.crt\nopenssl ca -gencrl -out crl.pem   # CRL 에 폐지 시리얼 포함\n# openssl verify -crl_check → error 23: certificate revoked',
            after: '# 조치: 폐지되지 않은 유효 인증서로 교체\nopenssl x509 -req -CA ca.crt -CAkey ca.key -out valid.crt ...\n# openssl verify -crl_check → valid.crt: OK'
          }
        }
      }
      if (t.includes('self_signed')) {
        return {
          label: '인증서 발급 방식', file: '인증서 발급', language: 'text',
          inline: {
            before: '# 취약: 자체서명 (issuer == subject — 스스로 서명)\nopenssl req -x509 -subj "/CN=host" ...',
            after: '# 조치: 신뢰 CA(공개 CA/내부 PKI)로 서명 (issuer = CA)\nopenssl x509 -req -CA ca.crt -CAkey ca.key ...'
          }
        }
      }
      if (t.includes('cipher') || t.includes('protocol')) {
        return {
          label: 'TLS 프로토콜/암호군 설정 (nginx)',
          file: 'conf.d/default.conf',
          language: 'nginx',
          before: path.join(TARGETS, 'tls-vulnerable', 'default.conf'),
          after: path.join(TARGETS, 'tls-remediated', 'default.conf')
        }
      }
      return {
        label: '인증서 발급 설정 (openssl req)',
        file: 'Dockerfile',
        language: 'dockerfile',
        before: path.join(TARGETS, 'tls-vulnerable', 'Dockerfile'),
        after: path.join(TARGETS, 'tls-remediated', 'Dockerfile')
      }
    case 'dns':
      return {
        label: 'DNS 존 파일 (SPF/DMARC)',
        file: 'db.example.lab',
        language: 'dns',
        before: path.join(TARGETS, 'dns-vulnerable', 'db.example.lab'),
        after: path.join(TARGETS, 'dns-remediated', 'db.example.lab')
      }
    case 'ssh':
      return {
        label: 'sshd_config', file: 'sshd_config', language: 'text',
        before: path.join(TARGETS, 'ssh-vulnerable', 'sshd_config'),
        after: path.join(TARGETS, 'ssh-remediated', 'sshd_config')
      }
    case 'network': {
      // 네트워크는 "설정 파일"이 아니라 서비스 노출 여부 → 방화벽/보안그룹 규칙 예시(포트별).
      const port = NET_PORT[t] || '<port>'
      return {
        label: '방화벽/보안그룹 규칙 (서비스 노출)',
        file: 'firewall / security group',
        language: 'text',
        inline: {
          before:
            '# 취약: 서비스 포트가 인터넷에 열려 있음\n' +
            `allow  tcp/${port}  from 0.0.0.0/0`,
          after:
            '# 조치: 차단 또는 내부망/VPN 만 허용\n' +
            `deny   tcp/${port}  from 0.0.0.0/0   # 필요 시 내부망 CIDR 만 allow`
        }
      }
    }
    default:
      return null
  }
}

// http 헤더 계열: issue_type → 관련 설정 라인 매처(해당 헤더만 발췌하기 위함)
//  (랩 nginx 타깃은 모든 보안 헤더를 한 번에 넣고 빼므로, 전체 파일 diff는 이 이슈와
//   무관한 헤더까지 섞여 혼란 → 이 이슈에 해당하는 줄만 발췌해서 보여준다)
function httpHeaderTargets(issueType) {
  const t = String(issueType || '').toLowerCase()
  if (t.includes('hsts')) return [/strict-transport-security/i]
  if (t.includes('csp') || t.includes('content_security')) return [/content-security-policy/i]
  if (t.includes('x_powered_by')) return [/x-powered-by/i, /server_tokens/i]
  if (t.includes('server_version') || t.includes('server_tokens')) return [/server_tokens/i]
  if (t.includes('cookie')) return [/set-cookie/i]
  if (t.includes('content_type')) return [/x-content-type-options/i]
  if (t.includes('frame') || t.includes('clickjack')) return [/x-frame-options/i]
  if (t.includes('x_xss')) return [/x-xss-protection/i]
  if (t.includes('referrer')) return [/referrer-policy/i]
  return null
}

// http 헤더: 이 이슈에 해당하는 헤더 줄만 발췌한 focused diff. 매처 없으면 null(→ 전체 diff).
function focusedHttpDiff(issueType, vulText, remText) {
  const targets = httpHeaderTargets(issueType)
  if (!targets) return null
  const vul = String(vulText).split('\n')
  const rem = String(remText).split('\n')
  // 주석(# 이후)은 매칭에서 제외 — 예: 조치 설정의 'X-Powered-By 미노출' 주석이 오매칭되는 것 방지.
  const codeOf = (l) => String(l).split('#')[0]
  const find = (lines, re) => { const l = lines.find((x) => re.test(codeOf(x))); return l ? l.trim() : null }
  const out = [
    { t: 'ctx', s: 'server {' },
    { t: 'ctx', s: '    listen 80;' },
    { t: 'ctx', s: '    server_name _;' }
  ]
  for (const re of targets) {
    const v = find(vul, re)
    const r = find(rem, re)
    if (v && r && v !== r) { out.push({ t: 'del', s: '    ' + v }); out.push({ t: 'add', s: '    ' + r }) }
    else if (r && !v) { out.push({ t: 'add', s: '    ' + r }) }
    else if (v && !r) { out.push({ t: 'del', s: '    ' + v }) }
    else if (v && r) { out.push({ t: 'ctx', s: '    ' + v }) }
  }
  out.push({ t: 'ctx', s: '    location / { … }' })
  out.push({ t: 'ctx', s: '}' })
  return out
}

// TLS: 이 이슈에 해당하는 줄만 발췌 (cipher→ssl_ciphers, protocol→ssl_protocols,
//  key_size→-newkey rsa, expiration→-days). 매처 없으면 null(→ 전체 diff).
function tlsTargets(issueType) {
  const t = String(issueType || '').toLowerCase()
  if (t.includes('cipher')) return [/ssl_ciphers/i]
  if (t.includes('protocol')) return [/ssl_protocols/i]
  if (t.includes('key_size')) return [/-newkey\s+rsa/i]
  if (t.includes('signature')) return [/-sha\d/i] // 취약 -sha1(서명), 조치 -sha256(서명)
  if (t.includes('expiration') || t.includes('expired')) return [/-days/i]
  return null
}
function focusedTlsDiff(issueType, vulText, remText, fileLabel) {
  const targets = tlsTargets(issueType)
  if (!targets) return null
  const vul = String(vulText).split('\n')
  const rem = String(remText).split('\n')
  const codeOf = (l) => String(l).split('#')[0]
  const find = (lines, re) => { const l = lines.find((x) => re.test(codeOf(x))); return l ? l.trim() : null }
  const out = [{ t: 'ctx', s: `# ${fileLabel}` }]
  for (const re of targets) {
    const v = find(vul, re)
    const r = find(rem, re)
    if (v && r && v !== r) { out.push({ t: 'del', s: '  ' + v }); out.push({ t: 'add', s: '  ' + r }) }
    else if (r && !v) out.push({ t: 'add', s: '  ' + r })
    else if (v && !r) out.push({ t: 'del', s: '  ' + v })
    else if (v && r) out.push({ t: 'ctx', s: '  ' + v })
  }
  return out.length > 1 ? out : null
}

// DNS: 이 이슈에 해당하는 존 레코드 줄만 발췌 (레코드 이름으로 앵커)
function dnsTargets(issueType) {
  const t = String(issueType || '').toLowerCase()
  if (t.includes('spf') && t.includes('malformed')) return [/^mal\s+in\s+txt/i]
  if (t.includes('subdomain') && t.includes('dmarc')) return [/^_dmarc\.sub\s+in\s+txt/i]
  if (t.includes('dmarc') && t.includes('none')) return [/^_dmarc\.pn\s+in\s+txt/i]
  if (t.includes('dmarc')) return [/^_dmarc\s+in\s+txt/i]
  if (t.includes('dkim')) return [/^sel\._domainkey\s+in\s+txt/i]
  if (t.includes('spf')) return [/^@\s+in\s+txt\s+"v=spf1/i]
  return null
}
// SSH: 이 이슈 해당 sshd_config 줄만 발췌 (cipher→Ciphers, protocol→KexAlgorithms/MACs)
function sshTargets(issueType) {
  const t = String(issueType || '').toLowerCase()
  if (t.includes('cipher')) return [/^ciphers\s/i]
  if (t.includes('protocol')) return [/^kexalgorithms\s/i, /^macs\s/i]
  return null
}
function focusedSshDiff(issueType, vulText, remText) {
  const targets = sshTargets(issueType)
  if (!targets) return null
  const vul = String(vulText).split('\n')
  const rem = String(remText).split('\n')
  const find = (lines, re) => { const l = lines.find((x) => re.test(x.trim())); return l ? l.trim() : null }
  const out = [{ t: 'ctx', s: '# sshd_config — 이 이슈 해당 설정' }]
  for (const re of targets) {
    const v = find(vul, re)
    const r = find(rem, re)
    if (v && r && v !== r) { out.push({ t: 'del', s: v }); out.push({ t: 'add', s: r }) }
    else if (r && !v) out.push({ t: 'add', s: r })
    else if (v && !r) out.push({ t: 'del', s: v })
    else if (v && r) out.push({ t: 'ctx', s: v })
  }
  return out.length > 1 ? out : null
}

function focusedDnsDiff(issueType, vulText, remText) {
  const targets = dnsTargets(issueType)
  if (!targets) return null
  const vul = String(vulText).split('\n')
  const rem = String(remText).split('\n')
  const find = (lines, re) => { const l = lines.find((x) => re.test(x.trim())); return l ? l.trim() : null }
  const out = [{ t: 'ctx', s: '; DNS 존 (example.lab) — 이 이슈 해당 레코드' }]
  for (const re of targets) {
    const v = find(vul, re)
    const r = find(rem, re)
    if (v && r && v !== r) { out.push({ t: 'del', s: v }); out.push({ t: 'add', s: r }) }
    else if (r && !v) out.push({ t: 'add', s: r })
    else if (v && !r) out.push({ t: 'del', s: v })
    else if (v && r) out.push({ t: 'ctx', s: v })
  }
  return out.length > 1 ? out : null
}

// 라인 단위 LCS diff → [{ t:'ctx'|'add'|'del', s }]
function diffLines(aText, bText) {
  const A = String(aText).replace(/\s+$/, '').split('\n')
  const B = String(bText).replace(/\s+$/, '').split('\n')
  const n = A.length
  const m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: 'ctx', s: A[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', s: A[i] }); i++ }
    else { out.push({ t: 'add', s: B[j] }); j++ }
  }
  while (i < n) out.push({ t: 'del', s: A[i++] })
  while (j < m) out.push({ t: 'add', s: B[j++] })
  return out
}

// 실제 랩 타깃 설정 파일(또는 inline 정의) 취약/조치 diff.
// 파일을 못 읽으면 null (프론트는 catalog 예시 configDiff 로 폴백).
export function readSourceDiff(templateId, issueType) {
  const spec = sourceSpec(templateId, issueType)
  if (!spec) return null
  let beforeText
  let afterText
  try {
    if (spec.inline) { beforeText = spec.inline.before; afterText = spec.inline.after }
    else { beforeText = fs.readFileSync(spec.before, 'utf8'); afterText = fs.readFileSync(spec.after, 'utf8') }
  } catch (e) {
    console.error('[lab] source diff read failed:', e.message)
    return null
  }
  // SSH: 이 이슈 해당 sshd_config 줄만 발췌.
  if (templateId === 'ssh') {
    const focused = focusedSshDiff(issueType, beforeText, afterText)
    if (focused) {
      return { label: '이 항목에 해당하는 실제 설정 변경 (sshd_config)', file: spec.file, language: spec.language, real: true, focused: true, lines: focused }
    }
  }
  // DNS: 이 이슈 해당 레코드 줄만 발췌(존에 여러 레코드가 있어 전체 diff는 혼란).
  if (templateId === 'dns') {
    const focused = focusedDnsDiff(issueType, beforeText, afterText)
    if (focused) {
      return { label: '이 항목에 해당하는 실제 레코드 변경 (DNS 존)', file: spec.file, language: spec.language, real: true, focused: true, lines: focused }
    }
  }
  // TLS: 이 이슈 줄만 발췌(취약 Dockerfile/conf 은 키·기간·프로토콜·암호를 함께 바꿔 혼란).
  if (templateId === 'tls') {
    const focused = focusedTlsDiff(issueType, beforeText, afterText, spec.file)
    if (focused) {
      return { label: '이 항목에 해당하는 실제 설정 변경', file: spec.file, language: spec.language, real: true, focused: true, lines: focused }
    }
  }
  // http 헤더: 이 이슈에 해당하는 헤더 줄만 발췌(전체 파일 diff는 다른 헤더까지 섞여 혼란).
  //  inline 정의(CSP 변형 등)는 이미 해당 줄만 담고 있으므로 아래 전체-diff 경로로(real:false).
  if (templateId === 'http_header' && !spec.inline) {
    const focused = focusedHttpDiff(issueType, beforeText, afterText)
    if (focused) {
      return {
        label: '이 항목에 해당하는 실제 설정 변경 (nginx)',
        file: spec.file,
        language: spec.language,
        real: true,
        focused: true, // 실제 조치 설정에서 이 이슈 관련 줄만 발췌
        lines: focused
      }
    }
  }
  return {
    label: spec.label,
    file: spec.file,
    language: spec.language,
    real: !spec.inline, // 실제 파일이면 true, inline 정의면 false
    lines: diffLines(beforeText, afterText)
  }
}
