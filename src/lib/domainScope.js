// =====================================================================
// 도메인/엔드포인트 스코프 모델
//  - SSC 조회용 값(sscLookupDomain = host)과 실제 접속 대상(serviceEndpoint = host:port)을 분리.
//  - 포트(예: 8443)는 접속/검증 대상에서 반드시 보존.
// =====================================================================

export function parseEndpoint(raw) {
  const rawDomainInput = String(raw || '').trim()
  const schemeMatch = rawDomainInput.match(/^([a-z][a-z0-9+.-]*):\/\//i)
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null

  let s = rawDomainInput.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') // 스킴 제거
  s = s.replace(/^[^@/]*@/, '') // userinfo 제거
  s = s.split('/')[0].split('?')[0].split('#')[0] // 경로/쿼리/프래그먼트 제거

  let host = s
  let port = null
  const pm = s.match(/^(\[[^\]]+\]|[^:]+):(\d+)$/) // host:port (IPv6 대괄호 포함)
  if (pm) { host = pm[1]; port = pm[2] }
  host = host.replace(/\.$/, '').toLowerCase()

  // 스킴이 없으면 포트로 추정(80→http, 그 외 https 기본). 사용자가 화면에서 수정 가능.
  const effScheme = scheme || (port === '80' ? 'http' : 'https')
  const serviceEndpoint = port ? `${host}:${port}` : host
  const accessUrl = `${effScheme}://${serviceEndpoint}`
  const sscLookupDomain = host

  return { rawDomainInput, host, port: port ? Number(port) : null, serviceEndpoint, accessUrl, sscLookupDomain }
}

// 같은 고객 내 중복 판단: serviceEndpoint(host:port) 기준.
// host만 같고 port가 다르면 다른 Endpoint로 허용하되, 동일 sscLookupDomain은 warning.
export function endpointConflicts(existingDomains, customer, ep) {
  const sameCustomer = (existingDomains || []).filter((d) => d.customer === customer)
  const exactDup = sameCustomer.some((d) => (d.serviceEndpoint || d.primary) === ep.serviceEndpoint)
  const sameLookupDifferentEndpoint = sameCustomer.some(
    (d) => (d.sscLookupDomain || d.primary?.split(':')[0]) === ep.sscLookupDomain && (d.serviceEndpoint || d.primary) !== ep.serviceEndpoint
  )
  return { exactDup, sameLookupDifferentEndpoint }
}
