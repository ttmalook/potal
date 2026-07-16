// 레시피 주도 제네릭 HTTP 응답기 (SSC AI Lab Builder · Phase 1 빠른 방식)
//  - 하나의 컨테이너가 모든 http_header 레시피의 before/after 를 동적으로 제공.
//  - GET /?h=<Header>&v=<Value>  → 해당 응답 헤더를 설정(취약값/조치값)
//  - GET /?h=<Header>           → 해당 헤더를 '없음'으로(취약: 헤더 부재)
//  - 내부 labnet 전용(외부 미노출). setHeader 가 잘못된 헤더는 거절 → 500 대신 안전 처리.
//  - 의존성 없음(Node 내장 http/url).
const http = require('http')
const { parse } = require('url')

http.createServer((req, res) => {
  let q = {}
  try { q = parse(req.url, true).query || {} } catch { q = {} }
  const h = typeof q.h === 'string' ? q.h : null
  const v = typeof q.v === 'string' ? q.v : null
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'X-Lab-Responder': 'generic' }
  try { if (h && v != null) headers[h] = v } catch { /* 잘못된 헤더명/값이면 무시 */ }
  try {
    res.writeHead(200, headers)
  } catch {
    // 잘못된 헤더로 writeHead 실패 시 헤더 없이 응답
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  }
  res.end(`lab-http-generic recipe responder\nheader=${h || '(none)'} value=${v == null ? '(unset)' : v}\n`)
}).listen(80, () => console.log('lab-http-generic listening on :80'))
