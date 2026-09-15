// Reuses window.requestJson from js/api.js and shared helpers from js/admin-common.js
// (escapeHtml, formatDate, toast, showPageError, showGate, showApp, showFatalError, renderAdminNav).
'use strict';

let statusFilter = 'pending';

function statusBadge(status) {
  const map = {
    pending: ['report-status-pending', '대기중'],
    actioned: ['report-status-actioned', '조치완료'],
    dismissed: ['report-status-dismissed', '기각됨']
  };
  const [cls, label] = map[status];
  return `<span class="ai-badge ${cls}">${label}</span>`;
}

// BE 응답(GET /api/admin/reports)에는 아직 신고 대상 리뷰의 작성자 id가 없고, 신고자(reporterId)만
// 있다. "제재하기"를 reporterId로 연결하면 신고해준 사람을 제재 대상으로 잘못 연결하게 되므로
// (실제 제재 대상은 리뷰 작성자), authorId가 응답에 추가되기 전까지는 버튼을 비활성 상태로 둔다.
// BE가 report.authorId를 내려주기 시작하면 이 조건만으로 자동으로 활성화된다.
function actionButtons(report) {
  const authorButton = report.authorId
    ? `<a class="ai-toggle danger" href="admin-sanctions.html?userId=${report.authorId}" target="_blank" rel="noopener">작성자 제재하기</a>`
    : `<button class="ai-toggle danger" disabled title="작성자 정보 연동 대기중(BE 응답에 authorId 추가 필요)">작성자 제재하기</button>`;

  const buttons = [authorButton];
  if (report.status === 'pending') {
    buttons.push(`<button class="ai-toggle" data-report-action="${report.reportId}:dismissed">기각</button>`);
    buttons.push(`<button class="ai-toggle danger" data-report-action="${report.reportId}:actioned">조치(리뷰 숨김)</button>`);
  }
  return buttons.join('');
}

function reportCard(report) {
  return `<div class="ai-card">
    <div class="ai-card-head">
      <div class="ai-card-head-left">${statusBadge(report.status)}<span class="ai-id">#${report.reportId}</span></div>
      <span class="ai-meta">${formatDate(report.createdAt)}</span>
    </div>
    <p class="ai-content">"${escapeHtml(report.reviewContentSnapshot)}" (별점 ${report.reviewRatingSnapshot})</p>
    <p class="ai-meta">신고자 userId ${report.reporterId} · 사유: ${escapeHtml(report.reason)}</p>
    <div class="ai-btn-row">${actionButtons(report)}</div>
  </div>`;
}

async function updateReportStatus(reportId, status) {
  try {
    const result = await window.requestJson('/api/admin/reports/' + reportId, { method: 'PATCH', body: { status } });
    if (!result) return; // 세션 만료(401) — 전역 로그인 리다이렉트에 맡기고 성공 토스트는 띄우지 않는다
    toast(status === 'actioned' ? '신고를 조치 처리했습니다(리뷰 숨김).' : '신고를 기각했습니다.');
    await loadReports(statusFilter);
  } catch (err) {
    toast(err.message || '처리에 실패했습니다.');
  }
}

function renderList(reports) {
  const listEl = document.getElementById('report-list');
  if (reports.length === 0) {
    listEl.innerHTML = '<p class="ai-empty">해당 상태의 신고가 없습니다.</p>';
    return;
  }
  listEl.innerHTML = reports.map(reportCard).join('');
  listEl.querySelectorAll('[data-report-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [id, status] = btn.dataset.reportAction.split(':');
      updateReportStatus(Number(id), status);
    });
  });
}

// 상태 필터를 빠르게 연속 전환하면 응답이 요청 순서와 다르게 도착해 이전(오래된) 필터 결과가
// 최신 결과를 덮어쓸 수 있다(search.js abf86c5와 동일 패턴). 새 요청 시작 시 진행 중인 이전
// 요청을 취소해서 막는다.
let reportsRequest = null;

async function loadReports(status) {
  statusFilter = status;
  document.querySelectorAll('.ap-status-filter [data-status]').forEach(b => {
    if (b.dataset.status === status) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  if (reportsRequest) reportsRequest.abort();
  const controller = new AbortController();
  reportsRequest = controller;

  try {
    const result = await window.requestJson(`/api/admin/reports?status=${status}&limit=50`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!result) return;
    renderList(result.data);
  } catch (err) {
    if (controller.signal.aborted) return;
    showPageError(err.message || '신고 목록을 불러오지 못했습니다.');
  }
}

async function checkAndLoad() {
  let me;
  try {
    me = await window.requestJson('/api/auth/me', { silent401: true });
  } catch (err) {
    if (err && err.status === 401) return showGate();
    return showFatalError('서버 연결에 실패했습니다.');
  }
  if (me.data.role !== 'admin') return showFatalError('관리자 권한이 필요합니다.');

  showApp();
  renderAdminNav('reports');
  loadReports(statusFilter);
}

document.querySelectorAll('.ap-status-filter [data-status]').forEach(btn => {
  btn.addEventListener('click', () => loadReports(btn.dataset.status));
});

checkAndLoad();
