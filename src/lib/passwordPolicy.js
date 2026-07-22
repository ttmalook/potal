// 비밀번호 정책 (프론트 미러 — 실제 강제는 백엔드 auth.js passwordPolicyError)
//  · 8자 이상 + 문자 종류(대문자·소문자·숫자·특수) 3종 이상 조합.
export const PW_MIN = 8
export const PW_POLICY_MSG = `${PW_MIN}자 이상 · 대문자·소문자·숫자·특수문자 중 3종류 이상 조합`

// 위반 시 안내 메시지, 통과 시 null.
export function passwordPolicyError(pw) {
  const s = String(pw ?? '')
  if (s.length < PW_MIN) return `비밀번호는 ${PW_POLICY_MSG}이어야 합니다.`
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(s)).length
  if (classes < 3) return `비밀번호는 ${PW_POLICY_MSG}이어야 합니다.`
  return null
}
