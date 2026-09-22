'use strict';
const assert = require('node:assert/strict');
const origin = process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:8093';
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
  check((await api('/api/admin/users/2/role', 'PATCH', { role: 'user' }, false)).status === 401, 'guest blocked');
  check((await api('/api/auth/me', 'GET', undefined, false)).status === 401, 'guest blocked from auth/me');

  // --- 권한 경계: 로그인은 했지만 관리자가 아닌 사용자 ---
  check((await api('/__preview/login-as-user', 'POST')).status === 200, 'fixture non-admin login');
  const nonAdminMe = (await api('/api/auth/me')).body.data;
  check(nonAdminMe.role === 'user', 'non-admin fixture user really is role=user');
  const nonAdminAttempt = await api('/api/admin/users/3/role', 'PATCH', { role: 'admin' });
  check(nonAdminAttempt.status === 403 && nonAdminAttempt.body.code === 'FORBIDDEN_NOT_ADMIN', 'non-admin rejected with 403, not treated as guest');

  check((await api('/__preview/login', 'POST')).status === 200, 'fixture admin login');
  const me = (await api('/api/auth/me')).body.data;
  check(me.role === 'admin', 'auth/me reports admin role for the fixture admin');

  // --- 자기 자신 강등 방지 (이슈 #90 3-3절 핵심 보안 규칙) ---
  const selfDemote = await api('/api/admin/users/1/role', 'PATCH', { role: 'user' });
  check(selfDemote.status === 403 && selfDemote.body.code === 'CANNOT_DEMOTE_SELF', 'admin cannot demote themselves');

  // 자기 자신을 다시 admin으로 "변경"하는 건 강등이 아니므로 막히지 않아야 한다 (동일 role로의 무해한 재요청).
  const selfNoop = await api('/api/admin/users/1/role', 'PATCH', { role: 'admin' });
  check(selfNoop.status === 200 && selfNoop.body.data.role === 'admin', 'admin re-confirming their own admin role is not blocked');

  // --- 다른 관리자는 강등할 수 있어야 한다 (자기 자신만 예외임을 확인) ---
  const demoteOther = await api('/api/admin/users/2/role', 'PATCH', { role: 'user' });
  check(demoteOther.status === 200 && demoteOther.body.data.role === 'user', 'demoting a different admin is allowed');

  // 원복 (다음 검증에 영향 주지 않도록)
  const restoreOther = await api('/api/admin/users/2/role', 'PATCH', { role: 'admin' });
  check(restoreOther.status === 200 && restoreOther.body.data.role === 'admin', 'restored other admin back to admin');

  // --- 일반 유저 승격 ---
  const promote = await api('/api/admin/users/3/role', 'PATCH', { role: 'admin' });
  check(promote.status === 200 && promote.body.data.userId === 3 && promote.body.data.role === 'admin', 'plain user promoted to admin');

  const demoteBack = await api('/api/admin/users/3/role', 'PATCH', { role: 'user' });
  check(demoteBack.status === 200 && demoteBack.body.data.role === 'user', 'promoted user demoted back to user');

  // --- 입력 검증/오용 방지 ---
  const badRole = await api('/api/admin/users/3/role', 'PATCH', { role: 'superadmin' });
  check(badRole.status === 400 && badRole.body.code === 'INVALID_ROLE', 'invalid role value rejected');

  const missingUser = await api('/api/admin/users/999999/role', 'PATCH', { role: 'admin' });
  check(missingUser.status === 404 && missingUser.body.code === 'USER_NOT_FOUND', 'nonexistent userId rejected');

  const nonPositiveId = await api('/api/admin/users/-1/role', 'PATCH', { role: 'admin' });
  check(nonPositiveId.status === 400 && nonPositiveId.body.code === 'INVALID_USER_ID', 'non-positive userId rejected');

  console.log('PASS: ' + checks + ' local admin-users preview API checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
