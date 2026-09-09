const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');

// 기존 .html 링크는 호환하고, 새 HTML 파일도 별도 라우트 등록 없이 제공한다.
module.exports = function createPageRouter(publicDir) {
  const router = express.Router();
  const root = path.resolve(publicDir);

  router.use(async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    let pathname;
    try {
      pathname = decodeURIComponent(req.path);
    } catch {
      return res.sendStatus(400);
    }

    // 잘못된 경로를 리다이렉트 대상으로 사용하거나 public 밖에서 탐색하지 않는다.
    const segments = pathname.split('/').slice(1);
    if (pathname.startsWith('//') || /[\\\x00-\x1f]/.test(pathname) ||
        segments.some(segment => segment === '.' || segment === '..')) {
      return res.sendStatus(404);
    }
    const isHtml = pathname.endsWith('.html');
    if (!isHtml && pathname !== '/index') return next();

    const file = path.join(root, pathname === '/index' ? 'index.html' : pathname.slice(1));
    try {
      if (!(await fs.stat(file)).isFile()) return next();
      // dotfiles는 express.static과 동일하게 공개하지 않는다.
      if (segments.some(segment => segment.startsWith('.'))) return next();
      const cleanPath = pathname === '/index' || pathname === '/index.html'
        ? '/'
        : pathname.slice(0, -5).split('/').map(encodeURIComponent).join('/');
      const queryAt = req.url.indexOf('?');
      const query = queryAt === -1 ? '' : req.url.slice(queryAt);
      return res.redirect(308, cleanPath + query);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return next();
      return next(error);
    }
  });

  router.use(express.static(root, { extensions: ['html'] }));
  return router;
};
