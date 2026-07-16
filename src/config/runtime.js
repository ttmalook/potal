// =====================================================================
// 런타임 플래그 (프론트엔드 공통)
//  - ENABLE_DEV_MOCKS: 개발/테스트용 Mock UI 노출 여부.
//    기본값 false. VITE_ENABLE_DEV_MOCKS=true 로 명시할 때만 켜짐.
//    · false: 사용자 화면에 Mock Mode / Mock Sample / Mock fallback 미노출.
//             API/Backend 실패 시 Mock으로 자동 대체하지 않고 오류 상태를 표시.
//    · true : Developer Mock Samples 및 수동 Mock 보기 버튼 표시(명확히 라벨).
//  - Mock 데이터 파일 자체는 삭제하지 않고 dev-only fixture로 보존.
//    참고: docs/SSC_DEV_MOCKS_POLICY.md
// =====================================================================
export const ENABLE_DEV_MOCKS = import.meta.env.VITE_ENABLE_DEV_MOCKS === 'true'
