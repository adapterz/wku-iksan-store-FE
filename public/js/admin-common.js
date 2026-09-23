// Shared UI helpers for the admin pages (admin-dashboard.js, admin-products.js, admin-reports.js, admin-sanctions.js).
// Reuses window.requestJson from js/api.js; must load before the page-specific script.
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

// 로컬 프리뷰 하네스에서만 쓰던 /__preview/login(가짜 관리자 로그인)은 실제 서버엔 없으므로,
// 다른 페이지와 동일한 로그인 리다이렉트 관례(login.html?redirect=...)로 이동한다.
document.getElementById('btn-admin-login').addEventListener('click', () => {
  navigateToLogin(window.location.href);
});

// 관리자 화면 공통 상단 네비게이션. 대시보드/문의하기는 같은 파일(admin-dashboard.html)의
// 두 탭이라 쿼리스트링(?tab=inquiries)으로 구분하고, 나머지는 각자 별도 페이지로 링크한다.
const ADMIN_NAV_ITEMS = [
  { key: 'dashboard', label: '대시보드', href: 'admin-dashboard.html' },
  { key: 'inquiries', label: '문의하기', href: 'admin-dashboard.html?tab=inquiries' },
  { key: 'products', label: '상품·카테고리', href: 'admin-products.html' },
  { key: 'reports', label: '신고', href: 'admin-reports.html' },
  { key: 'sanctions', label: '제재·회원', href: 'admin-sanctions.html' }
];

// nav[aria-label="관리자 화면"] 컨테이너가 있는 모든 관리자 페이지에서 공통으로 호출한다.
// onLocalTab이 주어지면(대시보드 페이지 전용) 대시보드/문의하기 항목 클릭 시 페이지 새로고침
// 없이 그 자리에서 탭만 전환하고, 그 외 페이지에서는 다른 관리자 화면으로 이동하는 평범한
// 링크로만 동작한다(href가 있어 새 탭 열기 등도 정상 동작).
function renderAdminNav(activeKey, onLocalTab) {
  const nav = document.querySelector('nav[aria-label="관리자 화면"]');
  if (!nav) return;
  nav.innerHTML = ADMIN_NAV_ITEMS.map(item =>
    `<a href="${item.href}"${item.key === activeKey ? ' aria-current="page"' : ''} data-nav-key="${item.key}">${item.label}</a>`
  ).join('');
  if (!onLocalTab) return;
  nav.querySelectorAll('a[data-nav-key="dashboard"], a[data-nav-key="inquiries"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      onLocalTab(a.dataset.navKey);
    });
  });
}
