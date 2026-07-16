// =====================================================================
// 랩 커버리지 분류 — SSC 전체 issue_type ↔ 지원 현황 대조(공유 로직).
//  - CLI(scripts/labCoverageAudit.mjs)와 관리자 API(/api/admin/lab-coverage)가
//    같은 판정을 쓰도록 여기서 단일 소스로 관리(화면=CLI 일치 보장).
//  - 재현 가능 여부는 '휴리스틱' 1차 분류. 최종 채택은 제작표준으로 사람 확인.
// =====================================================================

// 인프라 랩으로 재현 불가 — 기기탐지·평판·PII·정보성/긍정·관측성·CVE → guide-only 강제.
export function notReproducible(key, title, factor) {
  const s = (String(key) + ' ' + String(title || '')).toLowerCase()
  if (['ip_reputation', 'cubit_score', 'social_engineering', 'hacker_chatter', 'leaked_information', 'information_leak', 'endpoint_security', 'patching_cadence'].includes(String(factor))) return true
  // 특정 기기/제품 탐지 · 평판 · PII · 앱경로 · 원격접속 관측(RDP/VNC/SSH로 커버)
  if (/printer|airport|iot|network_attached_storage|mobile_printing|cisco_web_ui|bitcoin|minecraft|netbus|copyright|personal_information|local_file_path|ransomware|exploited|malicious|botnet|\bremote_access\b/.test(s)) return true
  // 관측성(외부 통신/발급국) · CVE 버전탐지(패치 스토리) → 인프라 랩 재현은 연출에 불과
  if (/^communication_|critical_vulnerability|_cve[_-]|blacklisted_country|denylist/.test(s)) return true
  // 정보성/긍정(취약점 아님)
  if (/uses_|_detected|_present\b|preloading|ocsp_stapling/.test(s)) return true
  return false
}

// 재현 가능 카테고리 휴리스틱 (key+title 키워드). null이면 인프라 랩 재현 불가.
export function classify(key, title, factor) {
  if (notReproducible(key, title, factor)) return null
  const s = (String(key) + ' ' + String(title || '')).toLowerCase()
  if (/(^|_)(spf|dmarc|dkim|dnssec)(_|$)|spf_|dmarc_|dkim_|dnssec/.test(s)) return 'dns'
  if (/tls_|ssl_|_cipher|weak_cipher|weak_protocol|tlscert|certificate|cert_|_protocol|self_signed|sweet32|poodle|beast|heartbleed|rc4|drown|logjam|freak|revocation|key_size|expired|excessive_expiration/.test(s)) return 'tls'
  if (/open_port|exposed|telnet|_ftp|ftp_|(^|_)rdp(_|$)|(^|_)vnc(_|$)|pptp|(^|_)smb(_|$)|snmp|netbios|remote_access|service_(mysql|redis|mongo|elastic|db|rdp|vnc|dns|telnet|ftp|smb|pptp|ldap)/.test(s)) return 'network'
  if (/hsts|strict_transport|content_security|(^|_)csp(_|$)|csp_|x_frame|clickjack|x_content_type|x_xss|referrer_policy|permissions_policy|cookie|x_powered_by|server_version|server_tokens|https_redirect|insecure_redirect|hpkp|cache_control|subresource_integrity/.test(s)) return 'http_header'
  return null
}

// 전체 카탈로그 + 지원 key 집합 → 버킷 분류.
//  catalog: getIssueTypeCatalog() 결과({ byKey })
//  supportedKeys: Set<소문자 key> (TEMPLATES ∪ 채택 레시피)
export function buildCoverage(catalog, supportedKeys) {
  const all = Object.values(catalog?.byKey || {})
  const buckets = { supported: [], toBuild: { http_header: [], tls: [], dns: [], network: [] }, guideOnly: [] }
  for (const e of all) {
    const key = String(e.key).toLowerCase()
    const category = classify(e.key, e.title, e.factor)
    if (supportedKeys.has(key)) buckets.supported.push(e)
    else if (category && buckets.toBuild[category]) buckets.toBuild[category].push(e)
    else buckets.guideOnly.push(e)
  }
  const catKeys = new Set(all.map((e) => String(e.key).toLowerCase()))
  const stale = [...supportedKeys].filter((k) => !catKeys.has(k))
  const toBuildCount = Object.values(buckets.toBuild).reduce((n, a) => n + a.length, 0)
  return { sscTotal: all.length, buckets, stale, toBuildCount }
}
