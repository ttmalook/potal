# Playwright 공식 이미지(브라우저 포함)
FROM mcr.microsoft.com/playwright:v1.48.0-jammy
# 증적 수집용 실제 CLI 도구: nmap(포트 스캔), ncat(접속 시도 시나리오), dig(dnsutils), openssl 포함.
RUN apt-get update && apt-get install -y --no-install-recommends nmap ncat dnsutils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
RUN mkdir -p /artifacts
EXPOSE 8899
CMD ["node", "server.js"]
