const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const createPageRouter = require('./server/page-router');

const PORT = process.env.PORT || 8080;
function createApp({ publicDir = path.join(__dirname, 'public'), backendUrl = process.env.BE_URL || 'http://localhost:3000' } = {}) {
  const app = express();

  // 백엔드 API 서버로 요청 전달 (Proxy)
  app.use(
    createProxyMiddleware({
      pathFilter: '/api',
      target: backendUrl,
      changeOrigin: true,
    })
  );

  // API 프록시 이후에 페이지 URL 정규화 및 정적 파일 처리
  app.use(createPageRouter(publicDir));
  return app;
}

if (require.main === module) createApp().listen(PORT, () => {
  console.log(`Frontend server is running on http://localhost:${PORT}`);
});
module.exports = { createApp };
