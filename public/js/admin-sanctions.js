// Isolated prototype: reuses window.requestJson from js/api.js and shared helpers from
// js/admin-common.js (escapeHtml, formatDate, toast, showPageError, showGate, showApp).
// No production page scripts are changed.
'use strict';

let currentUserId = null;
// 닉네임 조회(searchByNickname)로 currentUserId를 알아낸 경우에만 채워지고, userId를 직접
// 입력해 조회한 경우에는 null로 유지된다 — 승격 폼에서 "누구인지 아는 상태"인지 구분하는 용도.
let currentUserNickname = null;
// 관리자가 실제로 보고 싶어하는 userId. 검색 제출 시 즉시(응답을 기다리지 않고) 갱신되는 반면,
// currentUserId는 그 조회가 실제로 성공해서 화면에 반영된 뒤에만 갱신된다 — 그래서 제재 부여/해제
// 후 재조회 대상은 반드시 이 값을 써야 한다(아래 loadSanctions 주석 참고).
let intendedUserId = null;
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
    const targetUserId = currentUserId; // 이 요청이 어느 유저에 대한 것인지 시작 시점에 고정해둔다
    try {
      const result = await window.requestJson(`/api/admin/users/${targetUserId}/sanctions`, { method: 'POST', body });
      // silent401을 안 줬으므로 세션이 만료된 401 응답은 여기서 undefined로 돌아온다
      // (전역 로그인 리다이렉트가 이미 예약된 상태) — 이걸 성공으로 착각해 토스트를 띄우면 안 된다.
      if (!result) return;
      toast('제재를 부여했습니다.');
      // 요청이 오래 걸리는 동안 관리자가 이미 다른 userId를 조회 중이면(intendedUserId !== targetUserId)
      // 재조회를 건너뛴다. currentUserId로 무조건 재조회하면 그사이 시작된 더 최신 검색을 덮어쓰고
      // (#89 리뷰 지적), intendedUserId로 무조건 재조회하면 관리자가 오타 등으로 존재하지 않는
      // userId를 조회 중일 때 방금 성공한 제재 결과 대신 "찾을 수 없음" 화면을 다시 띄우게 된다 —
      // 두 경우 모두 방금 처리한 결과를 화면에서 확인할 수 없게 되므로, 관리자가 여전히 같은 유저를
      // 보고 있을 때만 재조회한다.
      if (targetUserId === intendedUserId) await loadSanctions(targetUserId);
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

// 관리자 승격/해제. userId만 보고 실수로 엉뚱한 계정을 승격시키는 사고를 막기 위해, 닉네임으로
// 조회해서 들어온 경우(searchByNickname)는 확인 문구에 닉네임을 같이 보여준다. userId를 직접
// 입력해 조회한 경우(닉네임을 모르는 상태)에는 여전히 userId만으로 confirm() 확인을 받는다 —
// 승격 전 대상을 확실히 확인하려면 닉네임으로 다시 조회하면 된다.
function roleFormPanel() {
  const who = currentUserNickname
    ? `userId ${currentUserId} (닉네임: ${escapeHtml(currentUserNickname)})`
    : `userId ${currentUserId}`;
  return `<div class="as-form-panel">
    <p class="as-form-title">관리자 권한</p>
    <div class="as-field">
      <label for="role-select">${who}의 역할 변경</label>
      <select id="role-select">
        <option value="">선택하세요</option>
        <option value="admin">관리자로 승격</option>
        <option value="user">일반 사용자로 해제</option>
      </select>
    </div>
    <p class="ai-field-error" id="role-form-error" hidden></p>
    <div class="ai-btn-row"><button class="ai-primary" id="submit-role">역할 변경</button></div>
  </div>`;
}

function wireRoleForm() {
  document.getElementById('submit-role').addEventListener('click', async () => {
    const errEl = document.getElementById('role-form-error');
    const role = document.getElementById('role-select').value;
    if (!role) {
      errEl.textContent = '변경할 역할을 선택하세요.';
      errEl.hidden = false;
      return;
    }

    const targetUserId = currentUserId;
    const who = currentUserNickname ? `${currentUserNickname}(userId ${targetUserId})` : `userId ${targetUserId}`;
    const confirmMessage = role === 'admin'
      ? `${who} 계정을 관리자로 승격하시겠습니까?${currentUserNickname ? '' : ' (닉네임 확인 없이 진행합니다 — 닉네임으로 조회하면 확인 후 승격할 수 있습니다)'}`
      : `${who} 계정의 관리자 권한을 해제하시겠습니까?`;
    if (!confirm(confirmMessage)) return;

    errEl.hidden = true;
    try {
      const result = await window.requestJson(`/api/admin/users/${targetUserId}/role`, { method: 'PATCH', body: { role } });
      if (!result) return; // 세션 만료(401) — 전역 로그인 리다이렉트에 맡기고 성공 토스트는 띄우지 않는다
      toast(role === 'admin' ? '관리자로 승격했습니다.' : '관리자 권한을 해제했습니다.');
    } catch (err) {
      errEl.textContent = err.code === 'CANNOT_DEMOTE_SELF'
        ? '본인 계정은 강등할 수 없습니다.'
        : (err.message || '역할 변경에 실패했습니다.');
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
    ${roleFormPanel()}
  `;

  resultEl.querySelectorAll('[data-lift]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetUserId = currentUserId; // 이 버튼이 속한 화면이 어느 유저 것인지 클릭 시점에 고정해둔다
      try {
        const result = await window.requestJson('/api/admin/sanctions/' + btn.dataset.lift, { method: 'PATCH' });
        if (!result) return; // 세션 만료(401) — 전역 로그인 리다이렉트에 맡기고 성공 토스트는 띄우지 않는다
        toast('정지를 조기 해제했습니다.');
        // 재조회 조건은 위 submit-sanction 핸들러 주석 참고.
        if (targetUserId === intendedUserId) await loadSanctions(targetUserId);
      } catch (err) {
        toast(err.message || '해제에 실패했습니다.');
      }
    });
  });

  wireForm();
  wireRoleForm();
}

// 조회를 빠르게 연속 제출하면(다른 userId로 재검색 등) 응답이 요청 순서와 다르게 도착해
// 이전(오래된) 조회 결과가 최신 결과를 덮어쓸 수 있다(search.js abf86c5와 동일 패턴).
// 새 요청 시작 시 진행 중인 이전 요청을 취소해서 막는다.
let sanctionsRequest = null;

async function loadSanctions(userId) {
  clearPageError();
  if (sanctionsRequest) sanctionsRequest.abort();
  const controller = new AbortController();
  sanctionsRequest = controller;

  try {
    const result = await window.requestJson(`/api/admin/users/${userId}/sanctions?limit=50`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!result) return;
    currentUserId = userId;
    sanctions = result.data;
    render();
  } catch (err) {
    if (controller.signal.aborted) return;
    if (err.code === 'USER_NOT_FOUND') {
      document.getElementById('result').innerHTML = `<p class="as-empty">userId ${userId} 회원을 찾을 수 없습니다.</p>`;
    } else {
      showPageError(err.message || '조회에 실패했습니다.');
    }
  }
}

// 닉네임은 UNIQUE 제약이 있어 정확히 일치하는 계정이 최대 1개다 — GET /api/admin/users?nickname=
// (BE-2, 이슈 #97에서 확정)로 userId/닉네임/role을 받아온 뒤, 이후 조회·승격은 그 userId로
// 기존 흐름(loadSanctions, PATCH .../:id/role)을 그대로 재사용한다.
async function searchByNickname(nickname) {
  try {
    const result = await window.requestJson(`/api/admin/users?nickname=${encodeURIComponent(nickname)}`);
    if (!result) return; // 세션 만료(401) — 전역 로그인 리다이렉트에 맡긴다
    intendedUserId = result.data.userId;
    currentUserNickname = result.data.nickname;
    await loadSanctions(result.data.userId);
  } catch (err) {
    // 실패 시 이전 조회 결과(제재 이력·역할 변경 폼)를 화면에 남겨두면, 토스트를 놓친 관리자가
    // "새로 검색한 유저"로 착각한 채 여전히 이전 유저(currentUserId)의 승격 버튼을 누르는 사고로
    // 이어질 수 있다 — 화면과 currentUserId/닉네임을 함께 비워서 어떤 유저의 화면인지 애매한
    // 상태가 남지 않게 한다.
    currentUserId = null;
    currentUserNickname = null;
    if (err.code === 'USER_NOT_FOUND') {
      document.getElementById('result').innerHTML = `<p class="as-empty">닉네임 "${escapeHtml(nickname)}"인 회원을 찾을 수 없습니다.</p>`;
    } else {
      document.getElementById('result').innerHTML = '';
      showPageError(err.message || '조회에 실패했습니다.');
    }
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
  renderAdminNav('sanctions');

  // 신고·문의 화면에서 "이 유저 제재 화면으로" 링크(admin-sanctions.html?userId=123)로 들어온
  // 경우, 닉네임을 몰라도 바로 조회까지 실행해서 admin이 다시 검색할 필요가 없게 한다.
  const linkedUserId = Number(new URLSearchParams(window.location.search).get('userId'));
  if (Number.isInteger(linkedUserId) && linkedUserId > 0) {
    intendedUserId = linkedUserId;
    currentUserNickname = null;
    loadSanctions(linkedUserId);
  }
}

document.getElementById('nickname-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('nickname-input');
  const nickname = input.value.trim();
  if (!nickname) {
    toast('닉네임을 입력하세요.');
    return;
  }
  searchByNickname(nickname);
});

checkAndLoad();
