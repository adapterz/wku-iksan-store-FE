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
  check((await api('/__preview/login', 'POST')).status === 200, 'fixture admin login');

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
