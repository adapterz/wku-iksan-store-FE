// Isolated prototype: reuses window.requestJson from js/api.js and shared helpers from
// js/admin-sample-common.js (escapeHtml, formatDate, toast, showPageError, showGate, showApp).
// No production page scripts are changed.
'use strict';

let reportTab = 'pending';

const STATUS_LABEL = { pending: ['status-pending', '대기'], dismissed: ['status-dismissed', '기각'], actioned: ['status-actioned', '숨김 처리'] };

function statusBadge(status) {
  const entry = STATUS_LABEL[status];
  if (!entry) return '';
  const [cls, label] = entry;
  return `<span class="ai-badge ${cls}">${label}</span>`;
}

function ratingStars(rating) {
  // 서버 CHECK 제약(1~5)을 신뢰하되, 예상 밖 값이 와도 화면이 깨지지 않도록 방어적으로 clamp한다.
  const safe = Math.min(5, Math.max(1, Math.round(Number(rating)) || 1));
  return '★'.repeat(safe) + '☆'.repeat(5 - safe);
}

function renderCard(item) {
  const isPending = item.status === 'pending';
  // review_id/reporter_id는 리뷰 삭제·회원 탈퇴 시 FK가 SET NULL로 비운다(이슈 #90 6-2절) —
  // "null"/"undefined"를 그대로 보여주지 않고 명시적으로 안내한다.
  const reviewRef = item.reviewId !== null
    ? `리뷰 #${item.reviewId}`
    : '<span class="ar-deleted">삭제된 리뷰</span>';
  const reporterRef = item.reporterId !== null
    ? `userId ${item.reporterId}`
    : '<span class="ar-deleted">탈퇴한 사용자</span>';

  const actions = isPending
    ? `<div class="ai-btn-row">
        <button class="ai-secondary" data-dismiss="${item.reportId}">기각</button>
        <button class="ar-danger" data-action="${item.reportId}">리뷰 숨김 처리</button>
      </div>`
    : '';

  const card = document.createElement('div');
  card.className = 'ai-card';
  // reviewContentSnapshot과 reason은 신고자·리뷰 작성자가 자유롭게 입력한 텍스트라서
  // escapeHtml 없이 그대로 넣으면 관리자 화면에서 실행되는 저장형 XSS가 될 수 있다.
  // 반드시 이스케이프해서만 렌더링한다.
  card.innerHTML = `<div class="ai-card-head">
    <div class="ai-card-head-left">${statusBadge(item.status)}<span class="ar-rating">${ratingStars(item.reviewRatingSnapshot)}</span><span class="ai-id">신고 #${item.reportId}</span></div>
  </div>
  <p class="ai-content">${escapeHtml(item.reviewContentSnapshot)}</p>
  <div class="ar-reason">
    <p class="ar-reason-label">신고 사유</p>
    <p>${escapeHtml(item.reason)}</p>
  </div>
  <p class="ai-meta">신고자 ${reporterRef} · ${reviewRef} · ${formatDate(item.createdAt)}</p>
  ${actions}`;

  if (isPending) {
    const buttons = card.querySelectorAll('[data-dismiss], [data-action]');
    card.querySelector('[data-dismiss]').addEventListener('click', () => submitDecision(item.reportId, 'dismissed', buttons));
    card.querySelector('[data-action]').addEventListener('click', () => {
      // 숨김 처리는 되돌리려면 리뷰 담당자 쪽 복구 API를 따로 타야 하는 조치라, 오클릭 방지용
      // 확인 한 번을 더 둔다("기각"은 취소해도 상태만 바뀌는 거라 되돌리기 쉬워 확인을 생략).
      if (!window.confirm('이 리뷰를 숨김 처리할까요? 목록/검색에서 즉시 제외됩니다.')) return;
      submitDecision(item.reportId, 'actioned', buttons);
    });
  }

  return card;
}

// 버튼을 먼저 비활성화해 더블클릭·연타로 같은 신고를 두 번 처리 요청하는 것을 막는다.
// (서버가 같은 상태로의 재요청을 막지는 않으므로, 중복 요청 자체를 FE에서 줄여준다.)
async function submitDecision(reportId, status, buttons) {
  buttons.forEach(b => { b.disabled = true; });
  try {
    await window.requestJson('/api/admin/reports/' + reportId, { method: 'PATCH', body: { status } });
    toast(status === 'actioned' ? '리뷰를 숨김 처리했습니다.' : '신고를 기각했습니다.');
    loadReports(reportTab);
  } catch (err) {
    toast(err.message || '처리에 실패했습니다.');
    buttons.forEach(b => { b.disabled = false; });
  }
}

async function loadReports(status) {
  reportTab = status;
  document.querySelectorAll('[data-report-tab]').forEach(b => {
    if (b.dataset.reportTab === status) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  try {
    const result = await window.requestJson(`/api/admin/reports?status=${status}&limit=50`);
    if (!result) return;
    const listEl = document.getElementById('report-list');
    if (result.data.length === 0) {
      listEl.innerHTML = '<p class="ai-empty">표시할 신고가 없습니다.</p>';
      return;
    }
    listEl.replaceChildren(...result.data.map(renderCard));
  } catch (err) {
    showPageError(err.message || '신고 목록을 불러오지 못했습니다.');
  }
}

async function checkAndLoad() {
  let me;
  try {
    me = await window.requestJson('/api/auth/me', { silent401: true });
  } catch (err) {
    // requestJson은 silent401: true여도 401에는 항상 throw한다(전역 리다이렉트만 건너뛸 뿐,
    // 조용히 undefined를 반환하지는 않는다) — 그래서 401은 여기서 분기해야 하고,
    // 아래의 `if (!me)`는 절대 참이 될 수 없는 코드다.
    if (err && err.status === 401) return showGate();
    return showFatalError('서버 연결에 실패했습니다.');
  }
  if (me.data.role !== 'admin') return showFatalError('관리자 권한이 필요합니다.');

  showApp();
  loadReports('pending');
}

document.querySelectorAll('[data-report-tab]').forEach(btn => {
  btn.addEventListener('click', () => loadReports(btn.dataset.reportTab));
});

checkAndLoad();
