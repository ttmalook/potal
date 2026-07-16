import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 단순 SPA 프로토타입용 Vite 설정
const proxy = {
  // /api 요청을 백엔드(기본 8787)로 프록시 → CORS 없이 호출 가능
  '/api': {
    target: process.env.VITE_BACKEND_URL || 'http://localhost:8787',
    changeOrigin: true
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 바인딩 → 외부(다른 PC)에서 http://<서버IP>:5173 접속 허용
    port: 5173,
    open: true,
    proxy
  },
  // 프로덕션 빌드 미리보기(vite preview)도 외부 접속 + /api 프록시 허용
  preview: {
    host: true,
    port: 5173,
    proxy
  }
})
