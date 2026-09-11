'use strict';
const assert = require('node:assert/strict');
const origin = process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:8089';
if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Local preview only');
const APPELLANT_ID = 2; // preview-admin-inquiries.cjs 고정 픽스처
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
  check((await api('/api/admin/dashboard', 'GET', undefined, false)).status === 401, 'guest blocked from dashboard');
  check((await api('/api/auth/me', 'GET', undefined, false)).status === 401, 'guest blocked from auth/me');
  check((await api('/__preview/login', 'POST')).status === 200, 'fixture admin login');

  // checkAndLoad()가 로그인 여부·role 확인용으로 호출하는 API가 실제로 마운트돼 응답하는지 확인
  // (이 라우트가 안 붙어 있으면 샘플 화면에 로그인 자체가 안 되는데, 화면에서만 봐서는 원인을 알기 어렵다).
  const me = (await api('/api/auth/me')).body.data;
  check(me.role === 'admin', 'auth/me reports admin role for the fixture admin');

  const dashboard = (await api('/api/admin/dashboard')).body.data;
  check(dashboard.pendingActions.reportCount === 2, 'reportCount fixture');
  check(dashboard.pendingActions.inquiryCount === 2, 'inquiryCount fixture (general + appeal, answered excluded)');
  check(dashboard.pendingActions.activeSuspensionCount === 2, 'activeSuspensionCount counts suspensions only, not the warning');
  check(dashboard.products.totalCount === 4, 'active product count excludes hidden/discontinued');
  check(dashboard.products.hiddenCount === 1, 'hiddenCount fixture');
  check(dashboard.products.discontinuedCount === 1, 'discontinuedCount fixture (PR #105 228a2f4)');
  // byBrand는 status='active'만 GROUP BY하므로, hidden/discontinued 상품의 브랜드는 여기 안 잡힌다.
  check(dashboard.products.byBrand.length === 4, 'byBrand excludes the hidden and discontinued product brands');
  check(dashboard.products.byBrand.every(b => b.count === 1), 'one active product per remaining brand');

  const pending = (await api('/api/admin/inquiries?status=pending')).body;
  check(pending.data.length === 2, 'two pending inquiries');
  const generalInquiry = pending.data.find(i => i.category === 'general');
  const appealInquiry = pending.data.find(i => i.category === 'sanction_appeal');
  check(!!generalInquiry && !!appealInquiry, 'both categories present in queue');

  const answeredBefore = (await api('/api/admin/inquiries?status=answered')).body;
  check(answeredBefore.data.length === 1, 'one pre-seeded answered inquiry');

  // 일반 문의 답변 (sanctionId 없음)
  const answered = await api('/api/admin/inquiries/' + generalInquiry.inquiryId, 'PATCH', { adminReply: '확인 후 처리했습니다.' });
  check(answered.status === 200 && answered.body.data.status === 'answered', 'general inquiry answered');
  check(answered.body.data.resolvedSanctionId === null, 'no sanction touched for general inquiry');

  // 동일 내용 재시도는 멱등하게 통과
  const retrySame = await api('/api/admin/inquiries/' + generalInquiry.inquiryId, 'PATCH', { adminReply: '확인 후 처리했습니다.' });
  check(retrySame.status === 200, 'identical retry is idempotent, not an error');

  // 다른 내용으로 재요청하면 충돌
  const retryDifferent = await api('/api/admin/inquiries/' + generalInquiry.inquiryId, 'PATCH', { adminReply: '다른 답변' });
  check(retryDifferent.status === 409 && retryDifferent.body.code === 'INQUIRY_ALREADY_PROCESSED', 'mismatched retry rejected');

  // 존재하지 않는 sanctionId로 승인 시도 시 거부 — appealInquiry가 아직 'pending'인 시점에 확인해야
  // 실패 사유가 "잘못된 sanctionId" 때문임을 "이미 처리된 문의"와 섞이지 않고 검증할 수 있다.
  const badSanctionAttempt = await api('/api/admin/inquiries/' + appealInquiry.inquiryId, 'PATCH', {
    adminReply: '확인 결과 정지 사유가 잘못 적용되어 해제합니다.',
    sanctionId: 999999
  });
  check(badSanctionAttempt.status !== 200, 'nonexistent sanctionId rejected while inquiry is still pending');

  // 제재 이의제기 승인 — 올바른 sanctionId를 함께 보내면 같은 트랜잭션에서 정지가 해제되어야 한다
  const sanctionsBefore = (await api('/api/admin/users/' + APPELLANT_ID + '/sanctions')).body.data;
  const targetSanction = sanctionsBefore.find(s => s.status === 'active');
  check(!!targetSanction, 'appellant has an active suspension to lift');

  const appealAnswered = await api('/api/admin/inquiries/' + appealInquiry.inquiryId, 'PATCH', {
    adminReply: '확인 결과 정지 사유가 잘못 적용되어 해제합니다.',
    sanctionId: targetSanction.sanctionId
  });
  check(appealAnswered.status === 200 && appealAnswered.body.data.resolvedSanctionId === targetSanction.sanctionId, 'appeal answered with resolvedSanctionId set');

  const sanctionsAfter = (await api('/api/admin/users/' + APPELLANT_ID + '/sanctions')).body.data;
  const liftedSanction = sanctionsAfter.find(s => s.sanctionId === targetSanction.sanctionId);
  check(liftedSanction.status === 'lifted', 'sanction actually lifted by the inquiry approval');

  const dashboardAfter = (await api('/api/admin/dashboard')).body.data;
  check(dashboardAfter.pendingActions.inquiryCount === 0, 'inquiryCount drops to 0 after both pending inquiries answered');
  check(dashboardAfter.pendingActions.activeSuspensionCount === 1, 'activeSuspensionCount drops by one after the lift');

  console.log('PASS: ' + checks + ' local admin-inquiries preview API checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
