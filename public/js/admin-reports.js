// Reuses window.requestJson from js/api.js and shared helpers from js/admin-common.js
// (escapeHtml, formatDate, toast, showPageError, showGate, showApp, showFatalError, renderAdminNav).
'use strict';

let statusFilter = 'pending';
let currentPage = 1;
let totalPages = 1;
// currentPage/totalPages가 실제로 어느 필터의 결과인지. 필터를 바꾸면 응답이 오기 전까지
// null로 비워, "더 보기"가 이전 필터의 페이지 번호로 다음 페이지를 요청하지 못하게 막는다.
let loadedFilter = null;
let isLoadingMore = false;

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
  updateLoadMoreButton();
}

// "더 보기"는 currentPage/totalPages가 지금 선택된 필터(statusFilter)의 결과일 때만 보인다.
// 필터를 바꾼 직후에는 loadedFilter가 비워져(null) 있어 새 필터의 1페이지가 도착하기 전까지
// 자동으로 숨겨진다(수정 방향 1). 조회 중에는 추가 클릭을 막기 위해 비활성화한다(수정 방향 2).
function updateLoadMoreButton() {
  const loadMoreBtn = document.getElementById('reports-load-more');
  const ready = loadedFilter === statusFilter && currentPage < totalPages;
  loadMoreBtn.hidden = !ready;
  loadMoreBtn.disabled = isLoadingMore;
}

// 상태 필터를 빠르게 연속 전환하면 응답이 요청 순서와 다르게 도착해 이전(오래된) 필터 결과가
// 최신 결과를 덮어쓸 수 있다(search.js abf86c5와 동일 패턴). 새 요청 시작 시 진행 중인 이전
// 요청을 취소해서 막는다. 다만 취소 타이밍만으로는 "필터 전환 중 응답이 오기 전에 더 보기를
// 눌러 잘못된 다음 페이지를 요청하는" 경우까지 막지 못해서, 아래 requestToken으로 한 번 더
// 오래된 응답을 걸러낸다(이슈 #138 7번 — 신고 필터 전환 중 '더 보기' 클릭 시 목록 혼합).
let reportsRequest = null;
let requestToken = 0;

// BE가 이미 meta.page/totalCount/totalPages를 내려주는데 limit=50 고정 첫 페이지만 요청하고
// 있어서, 한 상태에 신고가 50건을 넘으면 그 뒤는 화면에서 영영 확인할 수 없었다(PR #98 리뷰
// 지적 — 로컬 DB에 51건 넣어 재현됨). page를 받아 "더 보기"로 이어 붙이도록 고쳤다.
async function loadReports(status, page = 1) {
  const isFirstPage = page === 1;
  statusFilter = status;
  document.querySelectorAll('.ap-status-filter [data-status]').forEach(b => {
    if (b.dataset.status === status) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  // 필터를 바꾸면(1페이지 요청) 이전 필터의 currentPage/totalPages를 즉시 무효화해, 응답이
  // 오기 전까지 "더 보기"가 숨겨지고 다음 페이지도 계산되지 않게 한다. 추가 조회(2페이지~)는
  // 중복 클릭 방지를 위해 로딩 중 표시만 한다. showPageError는 다시 숨기는 로직이 없어서,
  // 1페이지 조회가 실패했다가 재시도로 성공해도 이전 에러 문구가 화면에 남아있었다 — 1페이지
  // 재조회를 시작하는 시점에 지워서, 성공하면 안 보이고 실패하면 catch에서 다시 뜨게 한다.
  if (isFirstPage) {
    loadedFilter = null;
    document.getElementById('page-error').hidden = true;
  } else {
    isLoadingMore = true;
  }
  updateLoadMoreButton();

  if (reportsRequest) reportsRequest.abort();
  const controller = new AbortController();
  reportsRequest = controller;
  const myToken = ++requestToken;

  try {
    const result = await window.requestJson(`/api/admin/reports?status=${status}&limit=50&page=${page}`, { signal: controller.signal });
    if (controller.signal.aborted || myToken !== requestToken) return;
    if (!result) return;
    currentPage = result.meta.page;
    totalPages = result.meta.totalPages;
    loadedFilter = status;
    renderList(result.data, { append: !isFirstPage });
  } catch (err) {
    if (controller.signal.aborted || myToken !== requestToken) return;
    if (isFirstPage) {
      // 1페이지 실패: 더 보기로 건너뛰지 않도록 loadedFilter를 비운 채로 둔다. 새로고침/필터
      // 재클릭으로 1페이지부터 다시 시도할 수 있다.
      showPageError(err.message || '신고 목록을 불러오지 못했습니다.');
    } else {
      // 추가 조회 실패: 기존 목록·페이지는 그대로 두고 같은 다음 페이지를 다시 시도할 수 있게 한다.
      toast(err.message || '목록을 더 불러오지 못했습니다. 다시 시도해주세요.');
    }
  } finally {
    if (myToken === requestToken) {
      isLoadingMore = false;
      updateLoadMoreButton();
    }
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
  // updateLoadMoreButton()이 이미 숨김/비활성화로 막아주지만, 클릭과 상태 반영 사이의
  // 짧은 틈까지 막기 위해 핸들러에서도 같은 조건을 한 번 더 확인한다.
  if (isLoadingMore || loadedFilter !== statusFilter || currentPage >= totalPages) return;
  loadReports(statusFilter, currentPage + 1);
});

checkAndLoad();
