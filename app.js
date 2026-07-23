const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;

// 백엔드 API 서버로 요청 전달 (Proxy)
app.use(
  createProxyMiddleware({
    pathFilter: '/api',
    target: process.env.BE_URL || 'http://localhost:3000',
    changeOrigin: true,
  })
);

// public/ 폴더 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Frontend server is running on http://localhost:${PORT}`);
});
