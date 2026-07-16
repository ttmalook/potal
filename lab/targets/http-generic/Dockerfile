# 레시피 주도 제네릭 HTTP 응답기 — SSC AI Lab Builder Phase 1(빠른 방식)
#  질의 파라미터로 임의 응답 헤더를 설정/생략 → 하나의 컨테이너가 모든 http_header 레시피 재현.
FROM node:20-alpine
WORKDIR /app
COPY server.js .
EXPOSE 80
CMD ["node", "server.js"]
