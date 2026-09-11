// Isolated prototype: reuses window.requestJson from js/api.js and shared helpers from
// js/admin-sample-common.js (escapeHtml, formatDate, toast, showPageError, showGate, showApp).
// No production page scripts are changed.
'use strict';

let currentUserId = null;
let sanctions = [];

function clearPageError() {
  document.getElementById('page-error').hidden = true;
}

// 정지는 status='active'라도 ends_at이 지났으면 화면에서는 만료로 보여준다
// (이슈 #90 7-3절: 자연 만료는 상태값을 안 바꾸고 조회 시점 ends_at으로 판단).
function displayStatus(s) {
  if (s.status === 'lifted') return 'lifted';
  if (s.type === 'warning') return 'active';
  return new Date(s.endsAt).getTime() > Date.now() ? 'active' : 'expired';
}

function typeBadge(type) {
  return type === 'warning'
    ? '<span class="ai-badge type-warning">경고</span>'
    : '<span class="ai-badge type-suspension">정지</span>';
}

function statusBadge(status) {
  const map = { active: ['status-active', '활성'], lifted: ['status-lifted', '해제됨'], expired: ['status-expired', '만료'] };
  const [cls, label] = map[status];
  return `<span class="ai-badge ${cls}">${label}</span>`;
}

function sanctionCard(s) {
  const status = displayStatus(s);
  const liftBtn = (s.type === 'suspension' && status === 'active')
    ? `<button class="ai-toggle" data-lift="${s.sanctionId}">조기 해제</button>`
    : '';
  return `<div class="ai-card">
    <div class="ai-card-head">
      <div class="ai-card-head-left">${typeBadge(s.type)}${statusBadge(status)}<span class="ai-id">#${s.sanctionId}</span></div>
      ${liftBtn}
    </div>
    <p class="ai-content">${escapeHtml(s.reason)}</p>
    <p class="ai-meta">부여자 userId ${s.issuedBy ?? '-'} · ${formatDate(s.createdAt)}${s.type === 'suspension' ? ' · 종료 ' + formatDate(s.endsAt) : ''}</p>
  </div>`;
}

function formPanel() {
  return `<div class="as-form-panel">
    <p class="as-form-title">새 제재 부여</p>
    <div class="as-type-row">
      <label><input type="radio" name="sanction-type" value="warning" checked>경고</label>
      <label><input type="radio" name="sanction-type" value="suspension">정지</label>
    </div>
    <div class="as-field" id="ends-at-field" hidden>
      <label for="ends-at-input">종료 시각</label>
      <input type="datetime-local" id="ends-at-input">
    </div>
    <div class="as-field">
      <label for="reason-input">사유</label>
      <textarea class="ai-textarea" id="reason-input" rows="2" placeholder="제재 사유를 입력하세요"></textarea>
    </div>
    <p class="ai-field-error" id="sanction-form-error" hidden></p>
    <div class="ai-btn-row"><button class="ai-primary" id="submit-sanction">제재 부여</button></div>
  </div>`;
}

function wireForm() {
  const radios = document.querySelectorAll('input[name="sanction-type"]');
  const endsAtField = document.getElementById('ends-at-field');
  radios.forEach(r => r.addEventListener('change', () => {
    endsAtField.hidden = document.querySelector('input[name="sanction-type"]:checked').value !== 'suspension';
  }));

  document.getElementById('submit-sanction').addEventListener('click', async () => {
    const errEl = document.getElementById('sanction-form-error');
    const type = document.querySelector('input[name="sanction-type"]:checked').value;
    const reason = document.getElementById('reason-input').value.trim();

    if (!reason) {
      errEl.textContent = '사유를 입력하세요.';
      errEl.hidden = false;
      return;
    }

    const body = { type, reason };
    if (type === 'suspension') {
      const endsAtValue = document.getElementById('ends-at-input').value;
      if (!endsAtValue) {
        errEl.textContent = '정지는 종료 시각을 입력해야 합니다.';
        errEl.hidden = false;
        return;
      }
      const endsAtDate = new Date(endsAtValue);
      if (Number.isNaN(endsAtDate.getTime()) || endsAtDate.getTime() <= Date.now()) {
        errEl.textContent = '종료 시각은 현재보다 미래여야 합니다.';
        errEl.hidden = false;
        return;
      }
      body.endsAt = endsAtDate.toISOString();
    }

    errEl.hidden = true;
    try {
      await window.requestJson(`/api/admin/users/${currentUserId}/sanctions`, { method: 'POST', body });
      toast('제재를 부여했습니다.');
      await loadSanctions(currentUserId);
    } catch (err) {
      if (err.code === 'WARNING_LIMIT_EXCEEDED') {
        errEl.textContent = '이미 경고 이력이 있어 정지로 처리해야 합니다.';
      } else {
        errEl.textContent = err.message || '제재 부여에 실패했습니다.';
      }
      errEl.hidden = false;
    }
  });
}

function render() {
  const resultEl = document.getElementById('result');
  const rows = sanctions.map(sanctionCard).join('');
  resultEl.innerHTML = `
    <p class="as-user-line">userId ${currentUserId}의 제재 이력 (${sanctions.length}건)</p>
    <div class="ai-list">${rows || '<p class="as-empty">제재 이력이 없습니다.</p>'}</div>
    ${formPanel()}
  `;

  resultEl.querySelectorAll('[data-lift]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await window.requestJson('/api/admin/sanctions/' + btn.dataset.lift, { method: 'PATCH' });
        toast('정지를 조기 해제했습니다.');
        await loadSanctions(currentUserId);
      } catch (err) {
        toast(err.message || '해제에 실패했습니다.');
      }
    });
  });

  wireForm();
}

async function loadSanctions(userId) {
  clearPageError();
  try {
    const result = await window.requestJson(`/api/admin/users/${userId}/sanctions?limit=50`);
    if (!result) return;
    currentUserId = userId;
    sanctions = result.data;
    render();
  } catch (err) {
    if (err.code === 'USER_NOT_FOUND') {
      document.getElementById('result').innerHTML = `<p class="as-empty">userId ${userId} 회원을 찾을 수 없습니다.</p>`;
    } else {
      showPageError(err.message || '조회에 실패했습니다.');
    }
  }
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
}

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('user-id-input');
  const userId = Number(input.value);
  if (!input.value.trim() || !Number.isInteger(userId) || userId <= 0) {
    toast('올바른 userId를 입력하세요.');
    return;
  }
  loadSanctions(userId);
});

checkAndLoad();
