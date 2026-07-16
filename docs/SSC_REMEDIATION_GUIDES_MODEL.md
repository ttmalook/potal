# Remediation Guides — 모델 및 화면 구조

작성: 2026-07-02 · 관련 코드: `src/pages/Pages.jsx` (`RemediationGuides`, `guideStateLabel`)

## 1. 메뉴 위치

`VALIDATION` 그룹, **Validation Sandbox 뒤 · Evidence Packs 앞**. (FINDINGS 하위가 아님)

## 2. 역할

Risk Finding·Sandbox 결과를 바탕으로 **일반 조치 권고(보편 템플릿)**를 정리하는 화면.
issue type 단위의 권고이며, 고객 환경 반영 전 내부 검토가 필요하다.

## 3. 화면 구조

```
고객사 컨텍스트 선택
→ Guide 목록 (테이블)
→ Guide ID / row 클릭
→ Guide 상세 드로어(슬라이드오버)
```
우측 고정 상세 패널은 제거하고 드로어로 통일.

## 4. 목록 컬럼

`Guide ID · Risk Finding · Issue Type · 위험도 · 조치 난이도 · 서비스 영향 · Guide 상태 · 금지표현 검사 · 최근 수정`

## 5. 상태 문구 (검증완료 오해 방지)

| 저장값 | 표시 라벨 |
|--------|-----------|
| Validated | **Guide Reviewed** |
| In Review | **Reviewing** |
| Draft | **초안** |

"Validated"는 고객 환경 검증 완료로 오해될 수 있어 화면 표기에서 제거(`guideStateLabel`).

## 6. Guide 상세 드로어 항목

Guide ID · 연결 고객사(컨텍스트) · Issue Type · Severity/Factor · 조치 난이도 · 서비스 영향 · Guide Version · Guide 상태 ·
금지 표현 검사 결과 · 가이드 개요 · 일반 조치 권고 · Source/Config 수정 위치 · Verification Command(해당 시) · 고객 내부 확인사항 ·
"SSC 재스캔/공식 Validation 필요" 문구.

## 7. 컴플라이언스

- 금지 표현(조치 검증 완료 등) 사용 금지. 허용: 일반 조치 권고 / 참고용 / 고객 내부 검토 필요 / SSC 재스캔·공식 Validation 필요.
- 현 단계 Guide 데이터는 dev fixture(일반 템플릿). 실제 Guide 저장/생성 백엔드는 후속.
