// =====================================================================
// Portal Store — 포털 자체 데이터(고객사/도메인) 영구 저장소 (파일 기반 JSON)
//  - SecurityScorecard API와 무관한 "우리 포털" 데이터의 CRUD 영속화.
//  - backend/data/portal-store.json 에 저장 → 새로고침/백엔드 재시작 후에도 유지.
//  - 최초 실행 시 SEED로 초기화(기존 화면과 동일한 초기 데이터).
//  - (POC용 경량 저장소. 이후 PostgreSQL로 승격 가능.)
// =====================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'portal-store.json')

const SEED = {
  customers: [
    { id: 'CUST-001', name: 'Acme Electronics', industry: '전자/제조', domains: 4, openRisks: 3, lastCheck: '2026-06-30', engineer: 'Jiwon Park', status: 'Active', contact: 'security@acme.example', note: '대표 도메인 및 포털/ API 서브도메인 점검 동의 완료.' },
    { id: 'CUST-002', name: 'Globex Insurance', industry: '금융/보험', domains: 3, openRisks: 4, lastCheck: '2026-06-29', engineer: 'Minseok Lee', status: 'Review', contact: 'infosec@globex.example', note: '금융권 변경관리 절차로 재관측 요청 진행 중.' },
    { id: 'CUST-003', name: 'Sample Manufacturing Co.', industry: '제조', domains: 3, openRisks: 2, lastCheck: '2026-06-28', engineer: 'Jiwon Park', status: 'Active', contact: 'it-ops@sample-mfg.example', note: '스크린샷 저장 허용, HAR 저장은 일부 도메인 제외.' },
    { id: 'CUST-004', name: 'Sample Finance Corp.', industry: '금융', domains: 2, openRisks: 1, lastCheck: '2026-06-25', engineer: 'Soyeon Kim', status: 'Suspended', contact: 'grc@sample-finance.example', note: '계약 갱신 검토로 점검 일시 보류.' }
  ],
  domains: [
    { id: 'DOM-001', customer: 'Acme Electronics', primary: 'www.example.co.kr', allow: ['https://www.example.co.kr/*', 'https://portal.example.co.kr/*'], deny: ['https://api.example.co.kr/internal/*'], screenshot: true, har: true, consent: '동의 완료', status: 'In Scope' },
    { id: 'DOM-002', customer: 'Acme Electronics', primary: 'portal.example.co.kr', allow: ['https://portal.example.co.kr/*'], deny: ['https://portal.example.co.kr/admin/*'], screenshot: true, har: false, consent: '동의 완료', status: 'In Scope' },
    { id: 'DOM-003', customer: 'Globex Insurance', primary: 'secure.sample-finance.com', allow: ['https://secure.sample-finance.com/*'], deny: ['https://secure.sample-finance.com/payment/*', 'https://secure.sample-finance.com/login/*'], screenshot: true, har: true, consent: '검토 중', status: 'Pending Consent' },
    { id: 'DOM-004', customer: 'Sample Manufacturing Co.', primary: 'api.example.co.kr', allow: ['https://api.example.co.kr/public/*'], deny: ['https://api.example.co.kr/v1/admin/*'], screenshot: false, har: false, consent: '동의 완료', status: 'Restricted' }
  ]
}

let state = null

function load() {
  if (state) return state
  try {
    if (fs.existsSync(FILE)) {
      state = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    } else {
      state = structuredClone(SEED)
      persist()
    }
  } catch (e) {
    console.error('[portalStore] load failed, using seed:', e.message)
    state = structuredClone(SEED)
  }
  if (!Array.isArray(state.customers)) state.customers = []
  if (!Array.isArray(state.domains)) state.domains = []
  if (!Array.isArray(state.evidencePacks)) state.evidencePacks = []
  return state
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2))
  } catch (e) {
    console.error('[portalStore] write failed:', e.message)
  }
}

// ── 파일 기반 내부 구현 (폴백) ──────────────────────────────────────
function fileList(key) { return load()[key] }
function fileUpsert(key, id, obj, prepend = true) {
  const s = load()
  const rec = { ...obj }
  const rest = s[key].filter((x) => x.id !== id)
  s[key] = prepend ? [rec, ...rest] : [...rest, rec]
  persist()
  return rec
}
function filePatch(key, id, patch) {
  const s = load()
  let found = null
  s[key] = s[key].map((x) => (x.id === id ? (found = { ...x, ...patch }) : x))
  if (found) persist()
  return found
}
function fileDelete(key, id) {
  const s = load()
  s[key] = s[key].filter((x) => x.id !== id)
  persist()
  return true
}

// ── Postgres-or-file 라우팅 ─────────────────────────────────────────
const TBL = { customers: 'portal_customers', domains: 'portal_domains', evidencePacks: 'portal_evidence_packs' }

async function repoList(key) { return db.isDbEnabled() ? db.docList(TBL[key]) : fileList(key) }
async function repoUpsert(key, id, obj) { return db.isDbEnabled() ? db.docUpsert(TBL[key], id, obj) : fileUpsert(key, id, obj) }
async function repoPatch(key, id, patch) {
  if (!db.isDbEnabled()) return filePatch(key, id, patch)
  const cur = await db.docGet(TBL[key], id)
  if (!cur) return null
  const next = { ...cur, ...patch }
  await db.docUpsert(TBL[key], id, next)
  return next
}
async function repoDelete(key, id) { return db.isDbEnabled() ? (db.docDelete(TBL[key], id), true) : fileDelete(key, id) }

// customers
export const getCustomers = () => repoList('customers')
export const addCustomer = (c) => repoUpsert('customers', c.id, c)
export const updateCustomer = (id, patch) => repoPatch('customers', id, patch)
export const deleteCustomer = (id) => repoDelete('customers', id)
// domains
export const getDomains = () => repoList('domains')
export const addDomain = (d) => repoUpsert('domains', d.id, d)
export const updateDomain = (id, patch) => repoPatch('domains', id, patch)
export const deleteDomain = (id) => repoDelete('domains', id)
// evidence packs
export const getEvidencePacks = () => repoList('evidencePacks')
export const addEvidencePack = (p) => repoUpsert('evidencePacks', p.id, p)
export const updateEvidencePack = (id, patch) => repoPatch('evidencePacks', id, patch)
export const deleteEvidencePack = (id) => repoDelete('evidencePacks', id)

// 최초 1회: Postgres가 비어있으면 파일(있으면)/SEED로 이관
export async function migratePortalIfEmpty() {
  if (!db.isDbEnabled()) return
  if ((await db.docCount('portal_customers')) > 0) return
  const f = load()
  const customers = f.customers?.length ? f.customers : SEED.customers
  const domains = f.domains?.length ? f.domains : SEED.domains
  const evidencePacks = f.evidencePacks || []
  for (const c of customers) await db.docUpsert('portal_customers', c.id, c)
  for (const d of domains) await db.docUpsert('portal_domains', d.id, d)
  for (const e of evidencePacks) await db.docUpsert('portal_evidence_packs', e.id, e)
  console.log(`[portalStore] Postgres 초기 이관 — customers:${customers.length} domains:${domains.length} evidencePacks:${evidencePacks.length}`)
}
