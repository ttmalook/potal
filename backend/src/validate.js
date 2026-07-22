// =====================================================================
// 입력 검증 · 새니타이즈 (Stored XSS 방어 · S-02)
//  - zod: 구조/형식/길이 검증. sanitize-html: HTML 태그 제거(스크립트/스타일 내용 포함).
//  - 필드는 "평문 텍스트"로 저장한다. sanitize-html 이 남기는 엔티티(&amp; 등)는 디코드해
//    이중 인코딩("Ben & Co"→"Ben &amp; Co")을 방지. 위험한 태그 구조는 이미 제거된 상태.
//  - 알 수 없는(시스템) 키는 passthrough 로 보존(id·ownerId·숫자·bool 등 — XSS 벡터 아님).
// =====================================================================
import { z } from 'zod'
import sanitizeHtml from 'sanitize-html'

// 태그 전부 제거(스크립트/스타일 내용까지 drop) → 남은 엔티티 디코드 → 평문화.
function strip(v) {
  if (v == null) return v
  const noTags = sanitizeHtml(String(v), { allowedTags: [], allowedAttributes: {} })
  const plain = noTags
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
  return plain.trim()
}

const req = (max) => z.preprocess(strip, z.string().min(1, '필수 입력입니다').max(max, `${max}자 이하로 입력하세요`))
const opt = (max) => z.preprocess(strip, z.string().max(max, `${max}자 이하로 입력하세요`).optional())
const urlArr = z.preprocess(
  (a) => (Array.isArray(a) ? a.map(strip).filter((s) => s) : a),
  z.array(z.string().max(500)).optional()
)

// ── 고객사 ──
export const customerCreate = z.object({
  id: opt(64),
  name: req(120),
  industry: opt(60),
  contactName: opt(80),
  contact: opt(160),
  status: opt(40),
  note: opt(2000),
  lastCheck: opt(40)
}).passthrough()

export const customerUpdate = z.object({
  name: opt(120),
  industry: opt(60),
  contactName: opt(80),
  contact: opt(160),
  status: opt(40),
  note: opt(2000),
  lastCheck: opt(40)
}).passthrough()

// ── 도메인 ──
const domainBase = {
  customer: opt(120),
  primary: opt(255),
  serviceEndpoint: opt(255),
  sscLookupDomain: opt(255),
  accessUrl: opt(500),
  baseUrl: opt(500),
  consent: opt(40),
  status: opt(40),
  allow: urlArr,
  deny: urlArr
}

export const domainCreate = z.object({ ...domainBase, customer: req(120) })
  .passthrough()
  .refine((d) => d.serviceEndpoint || d.primary, { message: '서비스 주소(도메인)는 필수입니다', path: ['serviceEndpoint'] })

export const domainUpdate = z.object(domainBase).passthrough()

// 라우트 공용: 검증 통과 시 정제된 body 반환, 실패 시 400 응답 후 null.
export function validateBody(schema, req_, res) {
  const r = schema.safeParse(req_.body || {})
  if (!r.success) {
    const first = r.error.issues[0]
    const where = (first.path || []).join('.') || '입력'
    res.status(400).json({ ok: false, errorCode: 'BAD_INPUT', message: `${where}: ${first.message}` })
    return null
  }
  return r.data
}
