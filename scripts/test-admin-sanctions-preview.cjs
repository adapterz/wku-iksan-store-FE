'use strict';
const assert = require('node:assert/strict');
const origin = process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:8090';
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
  check((await api('/api/admin/users/1/sanctions', 'GET', undefined, false)).status === 401, 'guest blocked');
  check((await api('/api/auth/me', 'GET', undefined, false)).status === 401, 'guest blocked from auth/me');
  check((await api('/__preview/login', 'POST')).status === 200, 'fixture admin login');

  // checkAndLoad()가 로그인 여부·role 확인용으로 호출하는 API가 실제로 마운트돼 응답하는지 확인
  // (이 라우트가 안 붙어 있으면 샘플 화면에 로그인 자체가 안 되는데, 화면에서만 봐서는 원인을 알기 어렵다).
  const me = (await api('/api/auth/me')).body.data;
  check(me.role === 'admin', 'auth/me reports admin role for the fixture admin');

  const userWithHistory = (await api('/api/admin/users/2/sanctions')).body.data;
  check(userWithHistory.length === 2, 'user 2 fixture has two sanctions');
  check(userWithHistory.some(s => s.type === 'warning'), 'user 2 has a warning');
  check(userWithHistory.some(s => s.type === 'suspension' && s.status === 'lifted'), 'user 2 has a lifted suspension');

  const userActive = (await api('/api/admin/users/3/sanctions')).body.data;
  check(userActive.length === 1 && userActive[0].status === 'active', 'user 3 has one active suspension');
  const targetSanctionId = userActive[0].sanctionId;

  const userClean = (await api('/api/admin/users/4/sanctions')).body.data;
  check(userClean.length === 0, 'user 4 starts with no sanctions');

  const missingUser = await api('/api/admin/users/999/sanctions');
  check(missingUser.status === 404 && missingUser.body.code === 'USER_NOT_FOUND', 'nonexistent user rejected');

  const firstWarning = await api('/api/admin/users/4/sanctions', 'POST', { type: 'warning', reason: '테스트 경고' });
  check(firstWarning.status === 201 && firstWarning.body.data.type === 'warning', 'first warning issued');

  const secondWarning = await api('/api/admin/users/4/sanctions', 'POST', { type: 'warning', reason: '중복 경고 시도' });
  check(secondWarning.status === 409 && secondWarning.body.code === 'WARNING_LIMIT_EXCEEDED', 'second warning rejected');

  const past = new Date(Date.now() - 86400000).toISOString();
  const pastSuspension = await api('/api/admin/users/4/sanctions', 'POST', { type: 'suspension', reason: '과거 종료 시각', endsAt: past });
  check(pastSuspension.status === 400 && pastSuspension.body.code === 'INVALID_ENDS_AT', 'past endsAt rejected');

  const future = new Date(Date.now() + 3 * 86400000).toISOString();
  const newSuspension = await api('/api/admin/users/4/sanctions', 'POST', { type: 'suspension', reason: '허위 리뷰 반복', endsAt: future });
  check(newSuspension.status === 201 && newSuspension.body.data.status === 'active', 'suspension issued for previously clean user');

  const liftResult = await api('/api/admin/sanctions/' + targetSanctionId, 'PATCH');
  check(liftResult.status === 200 && liftResult.body.data.status === 'lifted', 'active suspension lifted');

  const afterLift = (await api('/api/admin/users/3/sanctions')).body.data;
  check(afterLift.find(s => s.sanctionId === targetSanctionId).status === 'lifted', 'lift reflected on next fetch');

  const liftMissing = await api('/api/admin/sanctions/999999', 'PATCH');
  check(liftMissing.status === 404 && liftMissing.body.code === 'SANCTION_NOT_FOUND', 'lifting a nonexistent sanction rejected');

  console.log('PASS: ' + checks + ' local admin-sanctions preview API checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
