// =====================================================================
// 감사 저장소 — 실제 감사 로그(append-only). Postgres(doc store) 우선, 파일 폴백.
//  - kind: 'user'(사용자 행위) | 'security'(인증·권한) | 'system'(운영/인프라)
//  - 토큰·비밀번호 등 민감값은 절대 기록하지 않음(상태·대상 식별자만).
//  - recordAudit는 fire-and-forget(기록 실패가 요청을 막지 않음).
// =====================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import * as db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'audit-store.json')
const TABLE = 'audit_log'
const FILE_CAP = 2000

// 데모가 비어보이지 않도록 최초 1회 시드(실제 이벤트는 이 위에 append됨)
const SEED = [
  { kind: 'system', actor: 'system', role: 'system', action: '서버 시작', target: 'backend', result: 'OK' },
  { kind: 'user', actor: 'admin@ssc.local', role: 'admin', action: '고객사 등록', target: '데모커머스', result: 'Created' },
  { kind: 'user', actor: 'admin@ssc.local', role: 'admin', action: '증적 팩 고객 전달 준비', target: 'EP-GUIDE-hsts_incorrect-demo-commercecokr', result: 'Ready' }
]

let fileState = null
function loadFile() {
  if (fileState) return fileState
  try {
    fileState = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { entries: [] }
  } catch { fileState = { entries: [] } }
  if (!Array.isArray(fileState.entries)) fileState.entries = []
  return fileState
}
function persistFile() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(fileState, null, 2)) } catch { /* 무시 */ }
}
function fileAppend(rec) {
  const s = loadFile()
  s.entries.unshift(rec)
  if (s.entries.length > FILE_CAP) s.entries.length = FILE_CAP
  persistFile()
}
function fileList() { return loadFile().entries }

function mkEntry(e) {
  return {
    id: `AUD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    ts: new Date().toISOString(),
    kind: ['user', 'security', 'system'].includes(e.kind) ? e.kind : 'system',
    actor: e.actor || 'system',
    role: e.role || null,
    action: e.action || '',
    target: e.target || null,
    result: e.result || 'OK',
    ip: e.ip || null
  }
}

// 기록(비차단): 실패해도 throw하지 않음.
export async function recordAudit(e) {
  const rec = mkEntry(e || {})
  try {
    if (db.isDbEnabled()) await db.docUpsert(TABLE, rec.id, rec)
    else fileAppend(rec)
  } catch (err) {
    console.error('[audit] record failed:', err.message)
  }
  return rec
}

// 조회: 최신순, kind 필터 + 페이지네이션.
export async function listAudit({ kind, limit = 100, offset = 0 } = {}) {
  let all
  try { all = db.isDbEnabled() ? await db.docList(TABLE) : fileList() } catch { all = fileList() }
  all = [...(all || [])].sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
  if (kind && kind !== 'all') all = all.filter((x) => x.kind === kind)
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)
  const off = Math.max(parseInt(offset, 10) || 0, 0)
  return { total: all.length, items: all.slice(off, off + lim), limit: lim, offset: off }
}

// 최초 1회 시드(비어있을 때만). Postgres면 Postgres에, 아니면 파일에.
export async function seedAuditIfEmpty() {
  try {
    if (db.isDbEnabled()) {
      if ((await db.docCount(TABLE)) > 0) return
      for (const e of SEED) { const r = mkEntry(e); await db.docUpsert(TABLE, r.id, r) }
    } else {
      if (fileList().length > 0) return
      for (const e of [...SEED].reverse()) fileAppend(mkEntry(e))
    }
  } catch (err) { console.error('[audit] seed failed:', err.message) }
}
