// Isolated prototype: reuses window.requestJson from js/api.js and shared helpers from
// js/admin-sample-common.js (escapeHtml, formatDate, toast, showPageError, showGate, showApp).
// No production page scripts are changed.
'use strict';

let inquiryTab = 'pending';
let openId = null;

function statCard(label, value, { pending = false, onClick = null } = {}) {
  const el = document.createElement(onClick ? 'button' : 'div');
  el.className = 'ai-stat-card' + (pending ? ' pending' : '') + (onClick ? ' clickable' : '');
  el.innerHTML = `<p class="ai-stat-label">${label}</p><p class="ai-stat-value">${value}</p>`;
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

function renderDashboard(data) {
  const pendingEl = document.getElementById('pending-stats');
  pendingEl.replaceChildren(
    statCard('신고 대기', data.pendingActions.reportCount, { pending: data.pendingActions.reportCount > 0 }),
    statCard('문의 대기', data.pendingActions.inquiryCount, {
      pending: data.pendingActions.inquiryCount > 0,
      onClick: () => activateTab('inquiries')
    }),
    statCard('활성 정지 회원', data.pendingActions.activeSuspensionCount, { pending: data.pendingActions.activeSuspensionCount > 0 })
  );

  const productEl = document.getElementById('product-stats');
  const showDiscontinued = data.products.discontinuedCount > 0;
  productEl.className = 'ai-stat-grid' + (showDiscontinued ? '' : ' two');
  const productCards = [
    statCard('판매 중 상품', data.products.totalCount),
    statCard('숨김 상품', data.products.hiddenCount)
  ];
  if (showDiscontinued) productCards.push(statCard('단종 상품', data.products.discontinuedCount));
  productEl.replaceChildren(...productCards);

  const brandRowsEl = document.getElementById('brand-rows');
  const max = Math.max(...data.products.byBrand.map(b => b.count), 1);
  brandRowsEl.innerHTML = data.products.byBrand.map(b => `
    <div class="ai-brand-row">
      <span class="ai-brand-name">${escapeHtml(b.brand)}</span>
      <div class="ai-brand-track"><div class="ai-brand-fill" style="width:${Math.round(b.count / max * 100)}%"></div></div>
      <span class="ai-brand-count">${b.count}</span>
    </div>`).join('');
}

async function loadDashboard() {
  try {
    const result = await window.requestJson('/api/admin/dashboard');
    if (result) renderDashboard(result.data);
  } catch (err) {
    showPageError(err.message || '대시보드를 불러오지 못했습니다.');
  }
}

function buildReplyForm(item) {
  const appealControls = item.category === 'sanction_appeal'
    ? `<div class="ai-decision-row">
        <label><input type="radio" name="decision-${item.inquiryId}" value="approve" checked>정지 해제 승인</label>
        <label><input type="radio" name="decision-${item.inquiryId}" value="reject">반려</label>
        <input type="text" class="ai-sanction-input" id="sanction-${item.inquiryId}" placeholder="sanctionId" inputmode="numeric">
        <span class="ai-decision-hint">해제할 정지 건의 sanctionId를 입력하세요 (회원 제재 화면에서 조회 — 이 샘플 범위 밖).</span>
      </div>`
    : '';
  return `<div class="ai-reply-block">${appealControls}
    <textarea class="ai-textarea" id="reply-${item.inquiryId}" rows="2" placeholder="답변 내용을 입력하세요"></textarea>
    <p class="ai-field-error" id="err-${item.inquiryId}" hidden></p>
    <div class="ai-btn-row">
      <button class="ai-primary" data-submit="${item.inquiryId}">답변 등록</button>
      <button class="ai-secondary" data-cancel="${item.inquiryId}">취소</button>
    </div></div>`;
}

async function submitReply(item) {
  const textarea = document.getElementById('reply-' + item.inquiryId);
  const errEl = document.getElementById('err-' + item.inquiryId);
  const content = textarea.value.trim();
  if (!content) {
    errEl.textContent = '답변 내용을 입력하세요.';
    errEl.hidden = false;
    return;
  }
  errEl.hidden = true;

  const body = { adminReply: content };
  if (item.category === 'sanction_appeal') {
    const decision = document.querySelector(`input[name="decision-${item.inquiryId}"]:checked`).value;
    if (decision === 'approve') {
      const sanctionInput = document.getElementById('sanction-' + item.inquiryId);
      const sanctionId = Number(sanctionInput.value);
      if (!sanctionInput.value.trim() || !Number.isInteger(sanctionId) || sanctionId <= 0) {
        errEl.textContent = '정지 해제 승인은 sanctionId를 입력해야 합니다.';
        errEl.hidden = false;
        return;
      }
      body.sanctionId = sanctionId;
    }
  }

  try {
    await window.requestJson('/api/admin/inquiries/' + item.inquiryId, { method: 'PATCH', body });
    openId = null;
    toast('답변을 등록했습니다.');
    loadInquiries(inquiryTab);
  } catch (err) {
    errEl.textContent = err.message || '답변 등록에 실패했습니다.';
    errEl.hidden = false;
  }
}

function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'ai-card';

  const catBadge = item.category === 'sanction_appeal'
    ? '<span class="ai-badge appeal">제재 이의제기</span>'
    : '<span class="ai-badge general">일반 문의</span>';
  const statusBadge = item.status === 'pending'
    ? '<span class="ai-badge status-pending">대기</span>'
    : '<span class="ai-badge status-answered">답변완료</span>';
  const isOpen = openId === item.inquiryId;

  let bodyHtml = `<p class="ai-content">${escapeHtml(item.content)}</p><p class="ai-meta">userId ${item.userId} · ${formatDate(item.createdAt)}</p>`;
  if (item.status === 'answered') {
    bodyHtml += `<div class="ai-reply-block"><p class="ai-reply-label">관리자 답변</p><p>${escapeHtml(item.adminReply)}</p></div>`;
  } else if (isOpen) {
    bodyHtml += buildReplyForm(item);
  }

  card.innerHTML = `<div class="ai-card-head">
    <div class="ai-card-head-left">${catBadge}${statusBadge}<span class="ai-id">#${item.inquiryId}</span></div>
    ${item.status === 'pending' ? `<button class="ai-toggle" data-toggle>${isOpen ? '접기' : '답변하기'}</button>` : ''}
  </div>${bodyHtml}`;

  const toggleBtn = card.querySelector('[data-toggle]');
  if (toggleBtn) toggleBtn.addEventListener('click', () => {
    openId = openId === item.inquiryId ? null : item.inquiryId;
    loadInquiries(inquiryTab);
  });

  if (isOpen) {
    card.querySelector('[data-cancel]').addEventListener('click', () => { openId = null; loadInquiries(inquiryTab); });
    card.querySelector('[data-submit]').addEventListener('click', () => submitReply(item));
  }

  return card;
}

async function loadInquiries(status) {
  inquiryTab = status;
  document.querySelectorAll('[data-inquiry-tab]').forEach(b => {
    if (b.dataset.inquiryTab === status) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  try {
    const result = await window.requestJson(`/api/admin/inquiries?status=${status}&limit=50`);
    if (!result) return;
    const listEl = document.getElementById('inquiry-list');
    if (result.data.length === 0) {
      listEl.innerHTML = '<p class="ai-empty">표시할 문의가 없습니다.</p>';
      return;
    }
    listEl.replaceChildren(...result.data.map(renderCard));
  } catch (err) {
    showPageError(err.message || '문의 목록을 불러오지 못했습니다.');
  }
}

function activateTab(tab) {
  document.querySelectorAll('nav[aria-label="관리자 화면"] [data-tab]').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.getElementById('dashboard-view').hidden = tab !== 'dashboard';
  document.getElementById('inquiries-view').hidden = tab !== 'inquiries';
  if (tab === 'dashboard') loadDashboard();
  else loadInquiries(inquiryTab);
}

async function checkAndLoad() {
  let me;
  try {
    me = await window.requestJson('/api/auth/me', { silent401: true });
  } catch (err) {
    return showPageError('서버 연결에 실패했습니다.');
  }
  if (!me) return showGate();
  if (me.data.role !== 'admin') return showPageError('관리자 권한이 필요합니다.');

  showApp();
  activateTab('dashboard');
}

document.querySelectorAll('nav[aria-label="관리자 화면"] [data-tab]').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

document.querySelectorAll('[data-inquiry-tab]').forEach(btn => {
  btn.addEventListener('click', () => loadInquiries(btn.dataset.inquiryTab));
});

checkAndLoad();
