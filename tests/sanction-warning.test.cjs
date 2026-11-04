const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UNNOTIFIED = '/api/users/me/sanctions/unnotified';
const NOTIFY = '/api/users/me/sanctions/notify';
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

// component.js의 경고 안내(checkSanctionWarning)를 account:ready 이벤트로 구동해 검증한다.
function page({ sanctionIds = [], notify = async () => ({ data: {} }) } = {}) {
  const listeners = {}, toasts = [], timers = [], calls = [];
  const state = { userId: 1, generation: 0, sanctionIds };
  const document = {
    body: null, visibilityState: 'visible',
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => []
  };
  const requestJson = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === UNNOTIFIED) return { data: { count: state.sanctionIds.length, sanctionIds: state.sanctionIds } };
    if (url === NOTIFY) return notify(options);
    return { data: [] };
  };
  const window = { addEventListener() {}, location: { pathname: '/', search: '', href: '' },
    showToast: (message, duration) => toasts.push({ message, duration }) };
  const ctx = vm.createContext({ window, document, requestJson, location: window.location, console: { error() {} },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { length: 0 } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/component.js'), 'utf8'), ctx);
  // 계정 상태는 테스트가 직접 제어한다.
  window.accountGuard = {
    snapshot: () => ({ userId: state.userId, generation: state.generation }),
    isCurrent: token => token.userId === state.userId && token.generation === state.generation,
    currentUser: () => (state.userId === null ? null : { userId: state.userId })
  };
  const ready = async (user = { userId: state.userId }) => {
    (listeners['account:ready'] || []).forEach(fn => fn({ detail: { user } }));
    await flush();
  };
  // 토스트 표시 시간이 끝나는 시점을 흉내낸다.
  const finishToast = async () => { timers.splice(0).forEach(timer => timer.fn()); await flush(); };
  const notifyCalls = () => calls.filter(call => call.url === NOTIFY);
  const lookups = () => calls.filter(call => call.url === UNNOTIFIED);
  return { document, state, toasts, timers, calls, ready, finishToast, notifyCalls, lookups };
}

test('미안내 경고가 있으면 3~4초 토스트를 띄우고 표시가 끝난 뒤 그 ID로 확인 처리한다', async () => {
  const p = page({ sanctionIds: [11, 12] });
  await p.ready();
  assert.equal(p.toasts.length, 1);
  assert.match(p.toasts[0].message, /경고/);
  assert.ok(p.toasts[0].duration >= 3000 && p.toasts[0].duration <= 4000);
  assert.equal(p.timers[0].ms, p.toasts[0].duration);
  // 표시 시간이 끝나기 전에는 확인 처리하지 않는다(그 전에 떠나면 다음 화면에서 다시 안내).
  assert.equal(p.notifyCalls().length, 0);
  await p.finishToast();
  assert.equal(p.notifyCalls().length, 1);
  assert.equal(p.notifyCalls()[0].options.method, 'PATCH');
  assert.deepEqual([...p.notifyCalls()[0].options.body.sanctionIds], [11, 12]);
});

test('미안내 경고가 없으면 토스트도 확인 처리도 없다', async () => {
  const p = page();
  await p.ready();
  assert.equal(p.toasts.length, 0);
  assert.equal(p.notifyCalls().length, 0);
});

test('비로그인이면 조회 요청 자체를 보내지 않는다', async () => {
  const p = page({ sanctionIds: [11] });
  await p.ready(null);
  assert.equal(p.lookups().length, 0);
  assert.equal(p.toasts.length, 0);
});

test('토스트 표시 중 account:ready가 다시 발생해도 중복으로 안내하지 않는다', async () => {
  const p = page({ sanctionIds: [11] });
  await p.ready();
  await p.ready();
  assert.equal(p.lookups().length, 1);
  assert.equal(p.toasts.length, 1);
});

test('숨겨진 탭에서는 안내하지 않고, 탭으로 돌아오면 안내한다', async () => {
  const p = page({ sanctionIds: [11] });
  p.document.visibilityState = 'hidden';
  await p.ready();
  assert.equal(p.toasts.length, 0);
  assert.equal(p.notifyCalls().length, 0);
  p.document.visibilityState = 'visible';
  await p.ready();
  assert.equal(p.toasts.length, 1);
});

test('토스트 표시 중 탭을 벗어나면 확인 처리하지 않아 다시 안내할 수 있다', async () => {
  const p = page({ sanctionIds: [11] });
  await p.ready();
  p.document.visibilityState = 'hidden';
  await p.finishToast();
  assert.equal(p.notifyCalls().length, 0);
  p.document.visibilityState = 'visible';
  await p.ready();
  assert.equal(p.toasts.length, 2);
});

test('토스트 표시 중 계정이 바뀌면 이전 계정의 경고를 확인 처리하지 않는다', async () => {
  const p = page({ sanctionIds: [11] });
  await p.ready();
  p.state.userId = 2;
  await p.finishToast();
  assert.equal(p.notifyCalls().length, 0);
});

test('조회 응답을 기다리는 사이 계정이 바뀌면 안내하지 않는다', async () => {
  const p = page({ sanctionIds: [11] });
  const listenersReady = p.ready();
  p.state.generation = 1;
  await listenersReady;
  assert.equal(p.toasts.length, 0);
});

test('확인 처리가 실패해도 같은 화면에서 탭을 오갈 때 다시 뜨지 않는다', async () => {
  const p = page({ sanctionIds: [11], notify: async () => { throw new Error('offline'); } });
  await p.ready();
  await p.finishToast();
  assert.equal(p.notifyCalls().length, 1);
  await p.ready();
  assert.equal(p.toasts.length, 1);
});

test('이후 새로 받은 경고는 같은 화면에서도 안내한다', async () => {
  const p = page({ sanctionIds: [11] });
  await p.ready();
  await p.finishToast();
  p.state.sanctionIds = [11, 12];
  await p.ready();
  assert.equal(p.toasts.length, 2);
  await p.finishToast();
  assert.deepEqual([...p.notifyCalls()[1].options.body.sanctionIds], [12]);
});
