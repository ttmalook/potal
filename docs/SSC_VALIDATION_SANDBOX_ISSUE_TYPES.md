# Validation Sandbox — 지원 Issue Type 카탈로그

작성: 2026-07-02 · 관련 코드: `src/data/sandboxCatalog.js`

## 1. 목적

Validation Sandbox(파트너 표준 검증랩 PoC)가 **재현 + 조치 가이드**를 제공할 수 있는
issue_type의 subset을 SSC 메타데이터(`/metadata/issue-types`)에 매핑하여 구조화한다.
드롭다운/Evidence 화면은 이 카탈로그를 단일 소스로 사용한다.

## 2. 항목 스키마

```js
{
  key,                    // 내부 값 = issue_type_key (SSC issue_type과 정렬)
  display_name,           // 화면 표기명
  category,               // 드롭다운 그룹 (HTTP/Web Header, TLS/Certificate, DNS/Email, Network Service)
  ssc_factor,             // SSC factor (application_security / network_security / dns_health)
  severity,               // low | medium | high
  collector_type,         // web_screenshot | scan_report
  evidence_mode,          // before_after_header_and_source | before_after_scan_and_source
  remediation_mode,       // web_server_config | application_config | tls_config | dns_record | network_control
  source_config_targets,  // [nginx, apache, iis, firewall, dns_provider, ...]
  why,                    // 왜 문제인지 (Issue Summary)
  whereToChange,          // 조치 위치 목록 (Target Source/Config)
  configDiff,             // { label, file, lines:[{t:'ctx'|'add'|'del', s}] } — 참고 스니펫
  verification            // [명령...] with {host}/{port}/{endpoint} placeholder
}
```

## 3. 지원 카탈로그 (Phase 1)

| key | display_name | category | ssc_factor | severity | collector |
|-----|-------------|----------|-----------|----------|-----------|
| hsts_incorrect | HSTS Incorrect | HTTP/Web Header | application_security | medium | web_screenshot |
| cookie_missing_http_only | Cookie Missing HttpOnly | HTTP/Web Header | application_security | high | web_screenshot |
| cookie_missing_secure_attribute | Cookie Missing Secure | HTTP/Web Header | application_security | medium | web_screenshot |
| csp_no_policy | CSP Missing | HTTP/Web Header | application_security | medium | web_screenshot |
| x_powered_by_present | Server Tech Exposed (X-Powered-By) | HTTP/Web Header | application_security | low | web_screenshot |
| server_version_exposed | Server Version Exposed | HTTP/Web Header | application_security | low | web_screenshot |
| tls_weak_protocol | TLS Weak Protocol | TLS/Certificate | network_security | high | scan_report |
| tls_weak_cipher | TLS Weak Cipher | TLS/Certificate | network_security | high | scan_report |
| tlscert_excessive_expiration | Cert Excessive Expiration | TLS/Certificate | network_security | low | scan_report |
| spf_record_missing | SPF Record Missing | DNS/Email | dns_health | low | scan_report |
| dmarc_record_missing | DMARC Record Missing | DNS/Email | dns_health | low | scan_report |
| dkim_record_missing | DKIM Record Missing | DNS/Email | dns_health | low | scan_report |
| service_pptp | PPTP Service Accessible | Network Service | network_security | medium | scan_report |
| open_port | Open Port | Network Service | network_security | medium | scan_report |
| insecure_telnet | Insecure Telnet | Network Service | network_security | high | scan_report |
| insecure_ftp | Insecure FTP | Network Service | network_security | medium | scan_report |
| service_rdp | Service RDP Exposed | Network Service | network_security | high | scan_report |

## 4. 별칭(ALIASES) — 변형 key → 대표 key

같은 조치 템플릿을 공유하는 SSC 변형 key는 대표 key로 흡수한다(`catalogEntry`가 자동 해석, `aliasOf` 표기).

| 변형 key | → 대표 key |
|----------|-----------|
| hsts_incorrect_v2, hsts_preloaded_incorrect | hsts_incorrect |
| csp_no_policy_v2, content_security_policy_missing | csp_no_policy |
| spf_record_softfail, spf_record_wildcard | spf_record_missing |
| tlscert_expired, tlscert_no_revocation | tlscert_excessive_expiration |
| insecure_server_certificate_key_size | tls_weak_cipher |
| service_vnc | service_rdp |
| service_dns, service_smtp | open_port |

## 5. 드롭다운 규칙

- `catalogGroups()`가 category별 그룹을 반환 → `<optgroup>`로 렌더.
- 옵션 표기: `{display_name} ({key})`, 내부 value = `key`.
- **지원(sandbox_supported) 항목만** 노출. 미지원 issue_type은 목록에 없음.

## 6. Phase 2 / 미지원 처리

- 카탈로그에 없고 별칭도 없는 issue_type → 백엔드 `runLab`이 `status:'unsupported'` 반환, 화면은
  "수동 PoC 필요" 안내(warning). Evidence는 생성하지 않는다.
- 확장 후보(Phase 2): patching cadence, endpoint 보안, social engineering 등 **랩 재현 부적합/불가** 카테고리는 제외 유지.
