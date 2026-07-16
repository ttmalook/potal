// =====================================================================
// PostgreSQL 어댑터 (문서 저장소: id + JSONB data)
//  - 연결 성공 시 Postgres 사용, 실패 시 파일 저장소로 폴백(앱 무중단).
//  - 기존 JS 객체 형태를 그대로 JSONB로 영속 → 컬럼 매핑 부담 없음.
//  - 정규화 관계형 스키마(db/schema.sql)는 향후 리포팅/쿼리용 타깃으로 유지.
// =====================================================================
import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

// TLS(전송 중 암호화): PGSSL=true 로 활성(배포). 기본 off(로컬).
//  - PGSSL_REJECT_UNAUTHORIZED=false 면 자체서명 인증서 허용(사설 CA 등)
//  - DATABASE_URL 사용 시 ?sslmode=require 방식도 가능
const ssl = process.env.PGSSL === 'true'
  ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' }
  : false

const cfg = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'ssc_portal',
      user: process.env.PGUSER || 'ssc',
      password: process.env.PGPASSWORD || 'ssc_dev_pw',
      ssl
    }

// 주의: db/schema.sql의 관계형 lab_runs와 충돌하지 않도록 doc 테이블은 별도 이름 사용
const DOC_TABLES = ['portal_customers', 'portal_domains', 'portal_evidence_packs', 'lab_runs_doc', 'auth_users', 'auth_refresh_tokens', 'app_settings', 'guide_interpretations', 'lab_recipes', 'audit_log']

let pool = null
let enabled = false

export function isDbEnabled() { return enabled }

export async function initDb() {
  const p = new Pool({ ...cfg, connectionTimeoutMillis: 2500, max: 5 })
  try {
    await p.query('SELECT 1')
    for (const t of DOC_TABLES) {
      await p.query(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`)
    }
    pool = p
    enabled = true
    console.log('[db] PostgreSQL 연결됨 — 영속: Postgres (doc store)')
  } catch (e) {
    enabled = false
    try { await p.end() } catch {}
    console.log('[db] PostgreSQL 사용 불가 → 파일 저장소 폴백:', e.message)
  }
}

// 문서 CRUD (table은 고정 상수만 사용)
export async function docList(table) {
  const r = await pool.query(`SELECT data FROM ${table} ORDER BY updated_at DESC`)
  return r.rows.map((x) => x.data)
}
export async function docGet(table, id) {
  const r = await pool.query(`SELECT data FROM ${table} WHERE id = $1`, [id])
  return r.rows[0]?.data || null
}
export async function docUpsert(table, id, data) {
  await pool.query(
    `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()`,
    [id, data]
  )
  return data
}
export async function docDelete(table, id) {
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id])
}
export async function docCount(table) {
  const r = await pool.query(`SELECT count(*)::int AS n FROM ${table}`)
  return r.rows[0].n
}
