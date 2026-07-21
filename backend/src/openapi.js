// OpenAPI(Swagger) 스펙 — base 정의 + 라우트 파일의 @openapi 주석을 swagger-jsdoc 으로 병합.
//  · 스펙은 /api/admin/openapi.json (requireAuth+requireAdmin) 으로만 노출(비인증자 차단).
//  · 예시는 데모 데이터만 — 실 고객/SSC/시크릿 금지.
import swaggerJSDoc from 'swagger-jsdoc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'SSC Partner Portal API',
    version: '1.0.0',
    description:
      '보안 리스크 관측 · 검증랩 · 고객 전달 포털의 백엔드 API.\n\n' +
      '인증: 로그인 시 access 토큰(JWT, HS256)을 발급받아 `Authorization: Bearer <token>` 로 호출합니다. ' +
      'refresh 토큰은 HttpOnly 쿠키(`ssc_rt`, Path=/api/auth)로 관리됩니다. (예시는 데모 데이터 기준)'
  },
  servers: [{ url: '/', description: '현재 호스트' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
        description: '로그인 응답의 access 토큰. Authorization: Bearer <token>'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { ok: { type: 'boolean', example: false }, message: { type: 'string', example: '오류 메시지' } }
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'usr-admin' },
          email: { type: 'string', format: 'email', example: 'admin@demo.local' },
          name: { type: 'string', example: '파트너 관리자' },
          role: { type: 'string', enum: ['admin', 'partner', 'viewer'], example: 'admin' },
          phone: { type: 'string', nullable: true, example: null },
          department: { type: 'string', nullable: true, example: null },
          permissions: { type: 'object', description: '역할별 권한 매트릭스(리소스→액션)' }
        }
      },
      LabRun: {
        type: 'object',
        description: '검증랩 재현 실행 결과(참고용 PoC 증적).',
        properties: {
          id: { type: 'string', example: 'RUN-AB12CD34' },
          issueType: { type: 'string', example: 'hsts_incorrect_v2' },
          customer: { type: 'string', nullable: true, example: 'demo-commerce' },
          serviceEndpoint: { type: 'string', nullable: true, example: 'demo-commerce.example.com' },
          status: { type: 'string', enum: ['succeeded', 'failed', 'unsupported'], example: 'succeeded' },
          collector: { type: 'string', example: 'docker' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time' },
          evidence: { type: 'object', description: 'visual_before/after · technical_diff 등 증적' }
        }
      },
      EvidencePack: {
        type: 'object',
        description: '리스크 + 관측값 + 증적 + 권고 묶음(고객 전달 단위).',
        properties: {
          id: { type: 'string', example: 'EP-LAB-hsts_incorrect-demo-commerce' },
          customer: { type: 'string', example: 'demo-commerce' },
          issueType: { type: 'string', example: 'hsts_incorrect_v2' },
          source: { type: 'string', enum: ['lab', 'manual'], example: 'lab' },
          labRunId: { type: 'string', nullable: true, example: 'RUN-AB12CD34' },
          excluded: { type: 'boolean', description: '고객 전달에서 제외 여부', example: false }
        }
      }
    },
    responses: {
      Unauthorized: { description: '인증 필요/실패', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden: { description: '권한 부족(역할/퍼미션)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
    }
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'auth', description: '인증 · 사용자 · 비밀번호' },
    { name: 'portal', description: '증적 팩 · 고객 전달' },
    { name: 'lab', description: '검증랩 실행 · 증적' },
    { name: 'ssc', description: 'SecurityScorecard 연동' },
    { name: 'guides', description: '조치 가이드' },
    { name: 'settings', description: '설정' },
    { name: 'admin', description: '관리자 전용' }
  ]
}

// 라우트 파일의 JSDoc @openapi 주석을 스캔해 스펙을 빌드.
//  glob 은 forward slash 를 요구 — Windows 의 path.join 백슬래시를 변환(크로스플랫폼).
const scanGlob = path.join(__dirname, '*.js').replace(/\\/g, '/')
export const openapiSpec = swaggerJSDoc({ definition, apis: [scanGlob] })
