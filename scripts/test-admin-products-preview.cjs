'use strict';
const assert = require('node:assert/strict');
const origin = process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:8091';
if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Local preview only');
let cookie = '', checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };

async function api(url, method = 'GET', body, authenticated = true) {
  const res = await fetch(origin + url, {
    method,
    headers: { ...(authenticated && cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
  return { status: res.status, body: await res.json() };
}

(async () => {
  check((await api('/__preview/status')).body.localPreview === true, 'preview guard');
  check((await api('/api/admin/products', 'GET', undefined, false)).status === 401, 'guest blocked');
  check((await api('/api/auth/me', 'GET', undefined, false)).status === 401, 'guest blocked from auth/me');
  check((await api('/__preview/login', 'POST')).status === 200, 'fixture admin login');

  // checkAndLoad()가 로그인 여부·role 확인용으로 호출하는 API가 실제로 마운트돼 응답하는지 확인
  // (이 라우트가 안 붙어 있으면 샘플 화면에 로그인 자체가 안 되는데, 화면에서만 봐서는 원인을 알기 어렵다).
  const me = (await api('/api/auth/me')).body.data;
  check(me.role === 'admin', 'auth/me reports admin role for the fixture admin');

  const all = (await api('/api/admin/products')).body.data;
  check(all.length === 4, 'four fixture products');

  const active = (await api('/api/admin/products?status=active')).body.data;
  check(active.length === 2, 'two active products');
  const hidden = (await api('/api/admin/products?status=hidden')).body.data;
  check(hidden.length === 1 && hidden[0].name === '목기 다과상', 'one hidden product');
  const discontinued = (await api('/api/admin/products?status=discontinued')).body.data;
  check(discontinued.length === 1, 'one discontinued product');

  const cats = (await api('/api/categories', 'GET', undefined, false)).body.data;
  check(cats.length === 2, 'two fixture categories (public endpoint, no auth needed)');

  const newCategory = await api('/api/admin/categories', 'POST', { name: '제철 상품' });
  check(newCategory.status === 201, 'category created');
  const dupCategory = await api('/api/admin/categories', 'POST', { name: '제철 상품' });
  check(dupCategory.status === 409 && dupCategory.body.code === 'CATEGORY_ALREADY_EXISTS', 'duplicate category name rejected');

  const renamed = await api('/api/admin/categories/' + newCategory.body.data.id, 'PATCH', { name: '계절 한정' });
  check(renamed.status === 200 && renamed.body.data.name === '계절 한정', 'category renamed');

  const missingName = await api('/api/admin/products', 'POST', { brand: 'x', price: 1000, categoryId: 1 });
  check(missingName.status === 400 && missingName.body.code === 'REQUIRED_PRODUCT_NAME', 'missing product name rejected');

  const created = await api('/api/admin/products', 'POST', {
    name: '정읍 햅쌀 5kg', brand: '정읍쌀', price: 19000, categoryId: renamed.body.data.id
  });
  check(created.status === 201 && created.body.data.categoryName === '계절 한정', 'product created with correct categoryName join');

  const updated = await api('/api/admin/products/' + created.body.data.id, 'PATCH', { price: 21000 });
  check(updated.status === 200 && updated.body.data.price === 21000, 'product price updated');

  // FE의 readProductForm()이 선택 필드를 비웠을 때 키를 생략하지 않고 null을 명시적으로
  // 보내도록 고쳤는데(관리자가 값을 지워도 서버에 반영 안 되던 버그), 그 전제가 되는
  // "null을 보내면 실제로 지워지는지"를 API 레벨에서 확인한다.
  const withCaution = all.find(p => p.caution);
  check(!!withCaution, 'fixture has a product with a caution value to clear');
  const cleared = await api('/api/admin/products/' + withCaution.id, 'PATCH', { caution: null });
  check(cleared.status === 200 && cleared.body.data.caution === null, 'explicit null clears an optional field');

  const targetHidden = hidden[0];
  const statusChanged = await api('/api/admin/products/' + targetHidden.id + '/status', 'PATCH', { status: 'active' });
  check(statusChanged.status === 200 && statusChanged.body.data.status === 'active', 'hidden product reactivated');
  const hiddenAfter = (await api('/api/admin/products?status=hidden')).body.data;
  check(hiddenAfter.length === 0, 'no hidden products remain after reactivation');

  const badStatus = await api('/api/admin/products/' + created.body.data.id + '/status', 'PATCH', { status: 'deleted' });
  check(badStatus.status === 400 && badStatus.body.code === 'INVALID_PRODUCT_STATUS', 'invalid status value rejected');

  const missingProduct = await api('/api/admin/products/999999', 'PATCH', { price: 1 });
  check(missingProduct.status === 404 && missingProduct.body.code === 'PRODUCT_NOT_FOUND', 'nonexistent product rejected');

  console.log('PASS: ' + checks + ' local admin-products preview API checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
