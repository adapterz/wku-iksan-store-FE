const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { createApp } = require('../app');

let root, server, backend, base;
async function listen(app) {
  const srv = app.listen(0, '127.0.0.1');
  await new Promise(resolve => srv.once('listening', resolve));
  return srv;
}
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'iksan-page-urls-'));
  for (const file of ['index.html', 'product.html', 'login.html', 'brand.html', 'site.css', 'script.js', '.private.html']) {
    await fs.writeFile(path.join(root, file), `fixture:${file}`);
  }
  backend = await listen(http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Set-Cookie', 'sid=test; HttpOnly; Path=/');
    res.end(JSON.stringify({ url: req.url, method: req.method }));
  }));
  server = await listen(createApp({ publicDir: root, backendUrl: `http://127.0.0.1:${backend.address().port}` }));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  for (const srv of [server, backend]) if (srv) {
    srv.closeAllConnections();
    await new Promise(resolve => srv.close(resolve));
  }
  if (root) await fs.rm(root, { recursive: true, force: true });
});

for (const [url, expected] of [
  ['/product.html?id=76&type=self', '/product?id=76&type=self'],
  ['/index.html?source=home', '/?source=home'],
  ['/index', '/'],
  ['/login.html?redirect=%2Fproduct%3Fid%3D76', '/login?redirect=%2Fproduct%3Fid%3D76'],
  ['/brand.html?brand=%EB%AF%B8%EB%A5%B5%EC%82%B0&keyword=a%26b', '/brand?brand=%EB%AF%B8%EB%A5%B5%EC%82%B0&keyword=a%26b'],
]) test(`canonical redirect preserves query: ${url}`, async () => {
  const result = await fetch(base + url, { redirect: 'manual' });
  assert.equal(result.status, 308);
  assert.equal(result.headers.get('location'), expected);
  const followed = await fetch(base + expected);
  assert.equal(followed.status, 200);
  assert.equal(followed.redirected, false);
});

for (const [url, file] of [['/', 'index.html'], ['/product?id=76', 'product.html'], ['/site.css', 'site.css'], ['/script.js', 'script.js']]) {
  test(`serve existing content without redirect: ${url}`, async () => {
    const result = await fetch(base + url, { redirect: 'manual' });
    assert.equal(result.status, 200);
    assert.equal(await result.text(), `fixture:${file}`);
  });
}
test('new page works without server restart or route registration', async () => {
  await fs.writeFile(path.join(root, 'cart.html'), 'new cart');
  const result = await fetch(base + '/cart');
  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'new cart');
  const old = await fetch(base + '/cart.html', { redirect: 'manual' });
  assert.equal(old.headers.get('location'), '/cart');
});
for (const url of ['/missing', '/missing.html', '/.private.html', '/%2e%2e%2fsecret.html', '/%5cevil.html', '//evil.example/product.html']) {
  test(`missing or unsafe paths do not redirect: ${url}`, async () => {
    const result = await fetch(base + url, { redirect: 'manual' });
    assert.equal(result.status, 404);
    assert.equal(result.headers.get('location'), null);
  });
}
test('malformed URI returns 400, server remains healthy', async () => {
  assert.equal((await fetch(base + '/%E0%A4%A')).status, 400);
  assert.equal((await fetch(base)).status, 200);
});
test('HEAD redirects and serves pages without a response body', async () => {
  const old = await fetch(base + '/product.html?id=76', { method: 'HEAD', redirect: 'manual' });
  assert.equal(old.status, 308);
  assert.equal(old.headers.get('location'), '/product?id=76');
  const result = await fetch(base + '/product', { method: 'HEAD' });
  assert.equal(result.status, 200);
  assert.equal(await result.text(), '');
});
test('POST to a page is not redirected', async () => {
  const result = await fetch(base + '/product.html', { method: 'POST', redirect: 'manual' });
  assert.equal(result.status, 404);
});
for (const method of ['GET', 'POST']) test(`API proxy path and cookie remain unchanged (${method})`, async () => {
  const url = '/api/example.html?id=76';
  const result = await fetch(base + url, { method, redirect: 'manual' });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { url, method });
  assert.equal(result.headers.get('set-cookie'), 'sid=test; HttpOnly; Path=/');
});

test('shared page matching and login return URL support clean and legacy paths', async () => {
  const link = {};
  const context = {
    window: { location: { pathname: '/brand', href: 'https://iksan.store/brand?brand=%EB%AF%B8%EB%A5%B5%EC%82%B0' } },
    document: {
      body: null,
      addEventListener() {},
      // 이 테스트에는 하단 로그인 링크만 존재한다. 없는 모달/버튼은 실제 DOM처럼
      // null을 반환해야 공통 컴포넌트가 링크 객체를 모달 버튼으로 오인하지 않는다.
      getElementById: id => id === 'btn-bottom-my' ? link : null,
    },
    localStorage: { getItem: () => null },
  };
  const code = await fs.readFile(path.join(__dirname, '../public/js/component.js'), 'utf8');
  vm.runInNewContext(code, context);
  assert.equal(context.document.getElementById('btn-bottom-my'), link);
  for (const id of ['gift-arrival-modal', 'btn-gift-arrival-confirm', 'btn-gift-arrival-giftbox']) {
    assert.equal(context.document.getElementById(id), null);
  }
  for (const page of ['index', 'mypage', 'search', 'product', 'brand', 'category', 'wishlist']) {
    assert.equal(context.getPageFile('/' + page), page + '.html');
    assert.equal(context.getPageFile(page + '.html?x=1#section'), page + '.html');
  }
  assert.equal(context.getPageFile('/'), 'index.html');
  context.window.refreshBottomNavLoginLink();
  const loginUrl = new URL(link.href, 'https://iksan.store');
  assert.equal(loginUrl.searchParams.get('redirect'), context.window.location.href);
});

test('every current public HTML page is served unchanged at its clean URL', async () => {
  const publicDir = path.join(__dirname, '../public');
  const actualServer = await listen(createApp({ publicDir }));
  try {
    const pages = (await fs.readdir(publicDir)).filter(file => file.endsWith('.html'));
    for (const file of pages) {
      const url = file === 'index.html' ? '/' : '/' + file.slice(0, -5);
      const result = await fetch(`http://127.0.0.1:${actualServer.address().port}${url}`, { redirect: 'manual' });
      assert.equal(result.status, 200, file);
      // Response.text()는 UTF-8 BOM을 제거하므로 원본 바이트로 비교한다.
      assert.deepEqual(Buffer.from(await result.arrayBuffer()), await fs.readFile(path.join(publicDir, file)), file);
    }
  } finally {
    actualServer.closeAllConnections();
    await new Promise(resolve => actualServer.close(resolve));
  }
});
