// Isolated prototype: reuses window.requestJson from js/api.js and shared helpers from
// js/admin-sample-common.js (escapeHtml, formatDate, toast, showPageError, showGate, showApp,
// showFatalError). No production page scripts are changed.
'use strict';

function roleLabel(role) {
  return role === 'admin' ? '관리자' : '일반 회원';
}

function renderResult(data) {
  const resultEl = document.getElementById('result');
  const badgeClass = data.role === 'admin' ? 'role-admin' : 'role-user';
  resultEl.innerHTML = `<div class="ai-card">
    <div class="ai-card-head">
      <span class="ai-badge ${badgeClass}">${roleLabel(data.role)}</span>
    </div>
    <p class="ai-content">userId ${data.userId}의 역할이 "${roleLabel(data.role)}"(으)로 변경되었습니다.</p>
  </div>`;
}

document.getElementById('role-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('role-form-error');
  const input = document.getElementById('user-id-input');
  const userId = Number(input.value);
  const role = document.querySelector('input[name="role"]:checked').value;

  if (!input.value.trim() || !Number.isInteger(userId) || userId <= 0) {
    errEl.textContent = '올바른 userId를 입력하세요.';
    errEl.hidden = false;
    return;
  }
  errEl.hidden = true;

  // 역할 변경은 관리자 권한을 주고 뺏는 민감한 조치라, 오클릭 방지용으로 실행 전 한 번 더 확인한다.
  if (!window.confirm(`userId ${userId}의 역할을 "${roleLabel(role)}"(으)로 변경할까요?`)) return;

  const submitBtn = document.getElementById('role-form-submit');
  submitBtn.disabled = true;
  try {
    const result = await window.requestJson('/api/admin/users/' + userId + '/role', { method: 'PATCH', body: { role } });
    renderResult(result.data);
    toast('역할을 변경했습니다.');
  } catch (err) {
    if (err.code === 'CANNOT_DEMOTE_SELF') {
      errEl.textContent = '자기 자신의 관리자 권한은 강등할 수 없습니다.';
    } else if (err.code === 'USER_NOT_FOUND') {
      errEl.textContent = `userId ${userId} 회원을 찾을 수 없습니다.`;
    } else {
      errEl.textContent = err.message || '역할 변경에 실패했습니다.';
    }
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

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
}

checkAndLoad();
