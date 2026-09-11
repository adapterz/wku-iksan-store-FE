'use strict';
const assert = require('node:assert/strict');
const origin = process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:8092';
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
  check((await api('/api/admin/reports', 'GET', undefined, false)).status === 401, 'guest blocked from report queue');
  check((await api('/api/auth/me', 'GET', undefined, false)).status === 401, 'guest blocked from auth/me');

  // --- 권한 경계: 로그인은 했지만 관리자가 아닌 사용자 ---
  // checkAndLoad()가 401/403을 구분하게 만든 이유가 바로 이 케이스라, 실제로 403이
  // 나오는지 API 레벨에서 확인한다(FE의 role 분기는 브라우저 안 동작이라 이 스크립트로는
  // 직접 검증할 수 없지만, 최소한 서버가 403을 내려주는지는 확인할 수 있다).
  check((await api('/__preview/login-as-user', 'POST')).status === 200, 'fixture non-admin login');
  const nonAdminMe = (await api('/api/auth/me')).body.data;
  check(nonAdminMe.role === 'user', 'non-admin fixture user really is role=user');
  const nonAdminAttempt = await api('/api/admin/reports');
  check(nonAdminAttempt.status === 403 && nonAdminAttempt.body.code === 'FORBIDDEN_NOT_ADMIN', 'non-admin rejected with 403, not treated as guest');

  check((await api('/__preview/login', 'POST')).status === 200, 'fixture admin login');
  const me = (await api('/api/auth/me')).body.data;
  check(me.role === 'admin', 'auth/me reports admin role for the fixture admin');

  const pending = (await api('/api/admin/reports?status=pending')).body.data;
  check(pending.length === 4, 'four pending reports (normal, xss payload, review-deleted, reporter-deleted)');

  // --- 저장형 XSS 방어는 렌더링(escapeHtml) 책임이므로, API 계층에서는 원본 텍스트가
  // 그대로 보존돼야 한다(서버가 태그를 지우거나 바꾸면 오히려 원본 증거가 훼손된다).
  // 이스케이프 여부는 admin-reports-sample.js의 escapeHtml 사용으로 보장한다.
  const xssReport = pending.find(r => r.reason.includes('<script>'));
  check(!!xssReport, 'xss-payload report present with raw, unescaped text from the API');
  check(xssReport.reviewContentSnapshot.includes('<img'), 'review content snapshot also preserved raw');

  // --- FK ON DELETE SET NULL이 실제로 반영됐는지 (review 삭제 / 회원 탈퇴 후에도 신고 기록 유지) ---
  const deletedReviewReport = pending.find(r => r.reviewId === null);
  check(!!deletedReviewReport, 'report survives after its review was deleted (reviewId null, snapshot intact)');
  check(deletedReviewReport.reviewContentSnapshot.includes('example-spam.test'), 'snapshot content kept even though the review row is gone');

  const deletedReporterReport = pending.find(r => r.reporterId === null);
  check(!!deletedReporterReport, 'report survives after the reporter account was deleted (reporterId null)');

  const dismissed = (await api('/api/admin/reports?status=dismissed')).body.data;
  check(dismissed.length === 1, 'one pre-seeded dismissed report');

  const actioned = (await api('/api/admin/reports?status=actioned')).body.data;
  check(actioned.length === 1, 'one pre-seeded actioned report');

  // --- 입력 검증/오용 방지 ---
  const badStatusQuery = await api('/api/admin/reports?status=bogus');
  check(badStatusQuery.status === 400 && badStatusQuery.body.code === 'INVALID_REPORT_STATUS', 'invalid status filter rejected');

  const normalReport = pending.find(r => r.reason.includes('경쟁 판매자'));
  check(!!normalReport, 'normal pending report present for the decision-flow checks below');

  // pending으로 되돌리려는 시도(신고 은폐/재오픈 악용 시나리오) — 서버가 유효한 대상 상태로만 제한하는지 확인.
  const revertAttempt = await api('/api/admin/reports/' + normalReport.reportId, 'PATCH', { status: 'pending' });
  check(revertAttempt.status === 400 && revertAttempt.body.code === 'INVALID_REPORT_STATUS', 'cannot revert a report back to pending');

  // 허용되지 않은 필드를 끼워 보내는 마스 어사인먼트 시도 — 서버가 body를 통째로 거부하는지 확인.
  const massAssignAttempt = await api('/api/admin/reports/' + normalReport.reportId, 'PATCH', { status: 'dismissed', reviewId: 999999 });
  check(massAssignAttempt.status === 400 && massAssignAttempt.body.code === 'INVALID_REPORT_BODY', 'unexpected extra field in body rejected outright');

  const missingReport = await api('/api/admin/reports/999999', 'PATCH', { status: 'dismissed' });
  check(missingReport.status === 404 && missingReport.body.code === 'REPORT_NOT_FOUND', 'nonexistent reportId rejected');

  const nonPositiveId = await api('/api/admin/reports/-1', 'PATCH', { status: 'dismissed' });
  check(nonPositiveId.status === 400 && nonPositiveId.body.code === 'INVALID_REPORT_ID', 'non-positive reportId rejected');

  // --- 정상 처리 흐름 ---
  const dismissResult = await api('/api/admin/reports/' + normalReport.reportId, 'PATCH', { status: 'dismissed' });
  check(dismissResult.status === 200 && dismissResult.body.data.status === 'dismissed', 'normal report dismissed');

  const pendingAfterDismiss = (await api('/api/admin/reports?status=pending')).body.data;
  check(pendingAfterDismiss.every(r => r.reportId !== normalReport.reportId), 'dismissed report no longer in pending queue');

  console.log('PASS: ' + checks + ' local admin-reports preview API checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
