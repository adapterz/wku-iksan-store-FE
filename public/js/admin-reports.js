// Reuses window.requestJson from js/api.js and shared helpers from js/admin-common.js
// (escapeHtml, formatDate, toast, showPageError, showGate, showApp, showFatalError, renderAdminNav).
'use strict';

let statusFilter = 'pending';
let currentPage = 1;
let totalPages = 1;

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

// "더 보기"로 다음 페이지를 이어 붙일 때 innerHTML +=로 추가하면 기존 카드까지 전부 다시
// 파싱되면서 이미 걸려 있던 클릭 리스너가 통째로 사라진다 — insertAdjacentHTML로 새 카드만
// DOM에 추가하고, 아직 안 걸린(data-wired 없는) 버튼에만 리스너를 건다(재호출해도 중복 바인딩 안 됨).
function wireReportActionButtons() {
  document.querySelectorAll('#report-list [data-report-action]:not([data-wired])').forEach(btn => {
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const [id, status] = btn.dataset.reportAction.split(':');
      updateReportStatus(Number(id), status);
    });
  });
}

function renderList(reports, { append = false } = {}) {
  const listEl = document.getElementById('report-list');
  if (!append) listEl.innerHTML = '';
  if (!append && reports.length === 0) {
    listEl.innerHTML = '<p class="ai-empty">해당 상태의 신고가 없습니다.</p>';
  } else if (reports.length > 0) {
    listEl.insertAdjacentHTML('beforeend', reports.map(reportCard).join(''));
  }
  wireReportActionButtons();

  const loadMoreBtn = document.getElementById('reports-load-more');
  loadMoreBtn.hidden = currentPage >= totalPages;
}

// 상태 필터를 빠르게 연속 전환하면 응답이 요청 순서와 다르게 도착해 이전(오래된) 필터 결과가
// 최신 결과를 덮어쓸 수 있다(search.js abf86c5와 동일 패턴). 새 요청 시작 시 진행 중인 이전
// 요청을 취소해서 막는다.
let reportsRequest = null;

// BE가 이미 meta.page/totalCount/totalPages를 내려주는데 limit=50 고정 첫 페이지만 요청하고
// 있어서, 한 상태에 신고가 50건을 넘으면 그 뒤는 화면에서 영영 확인할 수 없었다(PR #98 리뷰
// 지적 — 로컬 DB에 51건 넣어 재현됨). page를 받아 "더 보기"로 이어 붙이도록 고쳤다.
async function loadReports(status, page = 1) {
  statusFilter = status;
  document.querySelectorAll('.ap-status-filter [data-status]').forEach(b => {
    if (b.dataset.status === status) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  if (reportsRequest) reportsRequest.abort();
  const controller = new AbortController();
  reportsRequest = controller;

  try {
    const result = await window.requestJson(`/api/admin/reports?status=${status}&limit=50&page=${page}`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!result) return;
    currentPage = result.meta.page;
    totalPages = result.meta.totalPages;
    renderList(result.data, { append: page > 1 });
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

document.getElementById('reports-load-more').addEventListener('click', () => {
  loadReports(statusFilter, currentPage + 1);
});

checkAndLoad();
