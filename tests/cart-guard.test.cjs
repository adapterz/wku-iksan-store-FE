const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 장바구니 아이콘 로그인 가드(component.js의 click 리스너)를 검증한다.
// window._authCheckSettled(최초 인증 확인 완료 플래그)와 isLoggedIn 조합별로 클릭을 가로채는지 확인.
function page({ settled, loggedIn }) {
  const listeners = {}, toasts = [], timers = [];
  const store = loggedIn ? { isLoggedIn: 'true' } : {};
  const location = { href: '' };
  const win = { addEventListener() {}, showToast: message => toasts.push(message), location };
  if (settled) win._authCheckSettled = true;
  const ctx = {
    window: win,
    document: {
      body: null,
      addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
      getElementById: () => null,
      querySelectorAll: () => []
    },
    localStorage: { getItem: key => store[key] ?? null },
    location,
    console: { error() {} },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    UNAUTHORIZED_REDIRECT_DELAY_MS: 800,
    requestJson: async () => ({ data: [] })
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/component.js'), 'utf8'), ctx);

  const click = (overrides = {}) => {
    let prevented = false;
    const event = {
      button: 0, ctrlKey: false, metaKey: false, shiftKey: false,
      preventDefault() { prevented = true; },
      target: { closest: selector => (selector === 'a.header-icon[href="cart.html"]' ? {} : null) },
      ...overrides
    };
    (listeners.click || []).forEach(fn => fn(event));
    return prevented;
  };
  return { click, toasts, timers, location };
}

test('최초 인증 확인 전(플래그 꺼짐)에는 클릭을 가로채지 않는다', () => {
  const p = page({ settled: false, loggedIn: false });
  assert.equal(p.click(), false);
  assert.equal(p.toasts.length, 0);
  assert.equal(p.timers.length, 0);
});

test('확인 완료 + 비로그인이면 토스트 후 로그인 페이지로 이동한다', () => {
  const p = page({ settled: true, loggedIn: false });
  assert.equal(p.click(), true);
  assert.deepEqual(p.toasts, ['로그인이 필요한 서비스입니다.']);
  assert.equal(p.timers[0].ms, 800);
  p.timers[0].fn();
  assert.equal(p.location.href, 'login.html?redirect=cart.html');
});

test('확인 완료 + 로그인 상태면 가로채지 않는다', () => {
  const p = page({ settled: true, loggedIn: true });
  assert.equal(p.click(), false);
  assert.equal(p.toasts.length, 0);
});

test('새 탭으로 여는 클릭(Ctrl/가운데 버튼)은 가로채지 않는다', () => {
  const p = page({ settled: true, loggedIn: false });
  assert.equal(p.click({ ctrlKey: true }), false);
  assert.equal(p.click({ button: 1 }), false);
  assert.equal(p.toasts.length, 0);
});
