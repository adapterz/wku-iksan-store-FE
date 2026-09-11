// Shared UI helpers for the admin sample prototypes (admin-inquiries-sample.js, admin-sanctions-sample.js,
// admin-products-sample.js, admin-reports-sample.js). Reuses window.requestJson from js/api.js; must load
// before the page-specific script.
'use strict';

let toastTimer = null;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function showPageError(message) {
  const el = document.getElementById('page-error');
  el.textContent = message;
  el.hidden = false;
}

function showGate() {
  document.getElementById('login-gate').hidden = false;
  document.getElementById('app').hidden = true;
}

function showApp() {
  document.getElementById('login-gate').hidden = true;
  document.getElementById('app').hidden = false;
}

// checkAndLoad()가 앱을 한 번도 보여주기 전에 실패하는 경우(관리자 아님, 그 외 서버 오류) 전용.
// 이 시점엔 로그인 게이트가 초기 HTML 기본값(보임)인 채로 남아있어서, showPageError()만 부르면
// "로그인 후 접근할 수 있어요" 안내와 에러 메시지가 동시에 뜬다. 게이트를 확실히 숨겨 에러만 보이게 한다.
// (앱이 이미 떠 있는 상태에서 데이터 조회 중 실패한 경우는 showPageError()를 그대로 쓴다 —
// 그때는 게이트가 이미 숨겨져 있고, 잘 쓰고 있던 화면을 이 함수처럼 강제로 가리면 오히려 더 나쁜 UX가 된다.)
function showFatalError(message) {
  document.getElementById('login-gate').hidden = true;
  document.getElementById('app').hidden = true;
  showPageError(message);
}

document.getElementById('sample-login').addEventListener('click', async () => {
  try {
    await window.requestJson('/__preview/login', { method: 'POST' });
    checkAndLoad();
  } catch (err) {
    toast('로그인 실패: ' + (err && err.message || ''));
  }
});
