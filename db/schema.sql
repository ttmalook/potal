-- =====================================================================
-- SSC Partner Portal — PostgreSQL schema (portal + lab)
-- 현재 파일 저장소(portal-store.json / lab-store.json)를 대체할 스키마.
-- 적용: docker compose(lab/docker-compose.yml)의 postgres에 초기화 스크립트로 사용.
-- =====================================================================

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  industry      TEXT,
  domains       INTEGER DEFAULT 0,
  open_risks    INTEGER DEFAULT 0,
  last_check    DATE,
  engineer      TEXT,
  status        TEXT,
  contact       TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domains (
  id            TEXT PRIMARY KEY,
  customer      TEXT NOT NULL,
  primary_domain TEXT NOT NULL,        -- 호스트명(정규화: 스킴/포트/경로 제거)
  base_url      TEXT,
  allow_urls    JSONB DEFAULT '[]',
  deny_urls     JSONB DEFAULT '[]',
  screenshot    BOOLEAN DEFAULT true,
  har           BOOLEAN DEFAULT false,
  consent       TEXT,
  status        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_domains_customer ON domains(customer);

-- SSC에서 수집·정규화한 Risk Finding (선택 저장: 재수집 없이 조회)
CREATE TABLE IF NOT EXISTS risk_findings (
  finding_id    TEXT PRIMARY KEY,      -- ssc:{issue_id}
  source        TEXT DEFAULT 'SecurityScorecard API',
  scorecard_identifier TEXT,
  domain        TEXT,
  issue_type    TEXT,
  issue_title   TEXT,
  factor        TEXT,
  severity      TEXT,
  status        TEXT,
  first_seen    TIMESTAMPTZ,
  last_seen     TIMESTAMPTZ,
  asset_type    TEXT,
  asset_value   TEXT,
  evidence_summary TEXT,               -- 요약만(원본 관측값 미저장)
  recommendation_summary TEXT,
  workflow_state TEXT DEFAULT 'SSC Risk Imported',
  collected_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_findings_domain ON risk_findings(domain);
CREATE INDEX IF NOT EXISTS idx_findings_issue_type ON risk_findings(issue_type);

-- 이슈타입 카탈로그 캐시 (metadata/issue-types)
CREATE TABLE IF NOT EXISTS issue_type_catalog (
  key           TEXT PRIMARY KEY,
  factor        TEXT,
  severity      TEXT,
  title         TEXT,
  synced_at     TIMESTAMPTZ DEFAULT now()
);

-- Validation Sandbox (Partner Lab PoC) 실행
CREATE TABLE IF NOT EXISTS lab_runs (
  id            TEXT PRIMARY KEY,
  finding_ref   TEXT,
  issue_type    TEXT,
  template_id   TEXT,                  -- http_header | tls | dns | network
  category      TEXT,
  evidence_mode TEXT,                  -- web_screenshot | scan_report
  tool          TEXT,
  collector     TEXT,                  -- simulated | docker
  status        TEXT,                  -- succeeded | failed | unsupported
  domain        TEXT,
  customer      TEXT,
  diff_summary  TEXT,
  guide         JSONB,
  logs          JSONB,
  disclaimers   JSONB,
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  evidence_pack_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_lab_runs_issue_type ON lab_runs(issue_type);

-- Before/After 아티팩트 (스크린샷/헤더/스캔결과)
CREATE TABLE IF NOT EXISTS lab_artifacts (
  id            TEXT PRIMARY KEY,
  run_id        TEXT REFERENCES lab_runs(id) ON DELETE CASCADE,
  kind          TEXT,                  -- visual_before | visual_after | headers_* | scan_* | har
  path          TEXT,
  sha256        TEXT,
  captured_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON lab_artifacts(run_id);
