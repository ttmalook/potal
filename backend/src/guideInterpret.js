// =====================================================================
// 조치 가이드 "해석"(비기술 쉬운말) 생성 — 로컬 Ollama + 캐시
//  - 입력: 유형별 정적 why(기술 설명) → 비즈니스 임팩트 중심 쉬운 한국어로 리라이팅
//  - 캐시: 유형(key) 기준. why 변경 시 whyHash 불일치로 재생성. DB(doc store) 우선, 없으면 인메모리.
//  - 실패(Ollama 다운/타임아웃)는 throw → 호출부/프론트가 기술 why로 폴백.
//  - 데이터는 외부로 나가지 않음(로컬 추론). npm 의존성 없음(내장 fetch/crypto).
// =====================================================================
import crypto from 'crypto'
import * as db from './db.js'

const TABLE = 'guide_interpretations'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'exaone3.5:2.4b'
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 90000)

const mem = new Map() // DB 비활성(개발 파일모드) 시 폴백 캐시
const whyHash = (s) => crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16)

// 해석 모드별 시스템 프롬프트
const PROMPTS = {
  // risk: 기술 '왜 문제인가' → 비즈니스 위험 (조치 가이드 해석)
  risk: '너는 IT 보안·인프라 기술 용어를 대기업 고객사 관리자(비기술자)에게 보고하는 친절한 기술 컨설턴트다. 입력받은 기술 설명을 바탕으로, 이 문제가 고객의 비즈니스(서비스 중단·정보 유출·신뢰성 저하 등)에 어떤 위험을 주는지 중심으로 쉬운 한국어로 3문장 이내로 요약하라. 기술 컴포넌트 명칭·프로토콜명·코드 수준 단어는 최대한 배제하고 비즈니스 임팩트 언어로 치환하라. 반드시 한국어만 사용하고 영어·한자 혼용을 금지한다. 인사말·부연설명 없이 한국어 요약 본론만 출력하라.',
  // remediation: SSC 공식 조치 방법(영문) → 쉬운 한국어 조치 설명 (리스크 점검 드로어)
  remediation: '너는 IT 보안 조치 방법을 대기업 고객사 관리자(비기술자)에게 쉬운 한국어로 풀어 설명하는 컨설턴트다. 입력받은 조치 방법(영문일 수 있음)을 고객이 이해하기 쉬운 한국어로 3문장 이내로 요약하라. 무엇을 왜 해야 하는지 중심으로, 전문 용어·제품명은 최대한 풀어 설명한다. 반드시 한국어만 사용하고 영어·한자 혼용을 금지한다. 인사말·부연설명 없이 한국어 요약 본론만 출력하라.'
}

async function getCache(key) {
  if (db.isDbEnabled()) { try { return await db.docGet(TABLE, key) } catch { return null } }
  return mem.get(key) || null
}
async function setCache(key, rec) {
  if (db.isDbEnabled()) { try { await db.docUpsert(TABLE, key, rec) } catch { /* noop */ } }
  else mem.set(key, rec)
}

async function callOllama(systemPrompt, userContent) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: { temperature: 0.3, num_predict: 220 },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ]
      }),
      signal: ctrl.signal
    })
    if (!res.ok) throw new Error(`ollama ${res.status}`)
    const j = await res.json()
    const text = String(j?.message?.content || '').trim()
    if (!text) throw new Error('empty response')
    return text
  } finally { clearTimeout(timer) }
}

// 유형(key) 기준 해석. kind='risk'(기술 why→비즈니스 위험) | 'remediation'(SSC 조치 방법→쉬운 조치).
// 입력(text 우선, 없으면 why) 없으면 null(프론트가 해석 섹션 생략). 실패 시 throw.
export async function interpret({ key, name, why, text, kind = 'risk', force = false }) {
  const input = String(text || why || '').trim()
  const rep = String(key || '').toLowerCase().replace(/_v\d+$/, '')
  if (!rep || !input) return { text: null, reason: 'no_input' }
  const cacheKey = kind === 'risk' ? rep : `${rep}:${kind}` // risk는 기존 캐시 키 유지
  const h = whyHash(input)
  if (!force) {
    const cached = await getCache(cacheKey)
    if (cached && cached.whyHash === h && cached.text) return { text: cached.text, cached: true, model: cached.model }
  }
  const sys = PROMPTS[kind] || PROMPTS.risk
  const label = kind === 'remediation' ? '조치 방법(원문)' : '기술 설명'
  const out = await callOllama(sys, `유형: ${name || rep}\n${label}: ${input}`)
  const rec = { key: cacheKey, text: out, whyHash: h, model: OLLAMA_MODEL, at: new Date().toISOString() }
  await setCache(cacheKey, rec)
  return { text: out, cached: false, model: OLLAMA_MODEL }
}
