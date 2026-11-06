const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

// innerHTML로 만든 카드 안의 요소를 class 이름으로 찾을 수 있게 하는 최소 DOM.
function element() {
  const listeners = {}, parts = new Map(), classes = new Set();
  let html = '';
  const el = {
    // 실제 DOM처럼 innerHTML을 다시 쓰면 기존 자식이 사라진다.
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; this.children = []; parts.clear(); },
    textContent: '', disabled: false, style: {}, src: '', children: [], listeners,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    addEventListener(type, fn) { listeners[type] = fn; },
    appendChild(child) { this.children.push(child); return child; },
    querySelector(selector) {
      const name = selector.replace(/^\./, '');
      if (!this.innerHTML.includes(`class="${name}"`) && !this.innerHTML.includes(`${name}"`)) return null;
      if (!parts.has(name)) parts.set(name, element());
      return parts.get(name);
    }
  };
  return el;
}

function giftbox({ search = '', lists = {}, cancel = async () => ({ data: {} }), confirmAnswer = true } = {}) {
  const nodes = new Map(), calls = [], alerts = [], toasts = [], confirms = [];
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  ['tab-unused', 'tab-used', 'tab-cancelled', 'gift-list-container'].forEach(get);
  const listeners = {};
  const document = {
    body: { style: {} },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    getElementById: id => nodes.get(id) || null,
    querySelector: () => null,
    createElement: element
  };
  let owner = { userId: 1, generation: 0 };
  const window = {
    location: { search, href: '' },
    accountGuard: { snapshot: () => owner, isCurrent: o => o === owner, ensureAction: async () => owner, invalidate() {} },
    registerAccountView: ({ load }) => { window.__load = load; },
    showToast: message => toasts.push(message),
    appendAccountRetryButton() {}
  };
  const requestJson = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/cancel')) return cancel(url, options);
    const status = new URLSearchParams(url.split('?')[1]).get('status');
    return { data: (lists[status] || []).map(g => ({ ...g })) };
  };
  const ctx = vm.createContext({
    window, document, requestJson, URLSearchParams, console: { error() {} },
    alert: m => alerts.push(m), confirm: m => { confirms.push(m); return confirmAnswer; },
    createSkeletonGuard: () => () => {}, navigateToLogin() {}, location: window.location
  });
  vm.runInContext(read('giftbox.js'), ctx);
  return {
    nodes, calls, alerts, toasts, confirms, window,
    // 다른 탭에서 다른 계정으로 로그인한 상황: 이전에 잡아 둔 계정 정보는 더 이상 현재 계정이 아니다.
    switchAccount: () => { owner = { userId: 2, generation: owner.generation + 1 }; },
    list: () => nodes.get('gift-list-container'),
    start: async () => { for (const fn of listeners['header:ready'] || []) await fn(); await window.__load(); await flush(); },
    cards: () => nodes.get('gift-list-container').children,
    gets: () => calls.filter(c => !c.url.includes('/cancel')),
    cancels: () => calls.filter(c => c.url.includes('/cancel'))
  };
}

const received = { giftId: 22, productName: '빵 세트', brand: '빵마을', isSelfGift: false, senderNickname: 'C', createdAt: '2026-11-06T00:00:00Z' };
const self = { giftId: 23, productName: '한우 세트', brand: '축협', isSelfGift: true, createdAt: '2026-11-06T00:00:00Z' };
const click = async (btn, event = { stopPropagation() { event.stopped = true; } }) => { await btn.listeners.click(event); await flush(); return event; };

test('미사용 탭 카드에만 취소 버튼이 있다', async () => {
  const p = giftbox({ lists: { unused: [received], used: [{ ...self, usedAt: '2026-11-06T00:00:00Z' }] } });
  await p.start();
  assert.ok(p.cards()[0].querySelector('.btn-gift-cancel'));
  await p.nodes.get('tab-used').listeners.click(); await flush();
  assert.equal(p.cards()[0].querySelector('.btn-gift-cancel'), null);
});

test('취소 버튼은 카드의 사용 화면 이동을 막고, 받은 선물은 보낸 분 알림 안내를 확인창에 넣는다', async () => {
  const p = giftbox({ lists: { unused: [received] } });
  await p.start();
  const event = await click(p.cards()[0].querySelector('.btn-gift-cancel'));
  assert.equal(event.stopped, true);
  assert.match(p.confirms[0], /^이 교환권을 취소할까요\?\n\n취소하면 더 이상 사용할 수 없고 되돌릴 수 없습니다\.\n금액은 환불되지 않으며, 보낸 분에게 알림이 가지 않습니다\.$/);
});

test('나에게 구매한 교환권은 확인창 마지막 줄이 환불 안내만 있다', async () => {
  const p = giftbox({ lists: { unused: [self] } });
  await p.start();
  await click(p.cards()[0].querySelector('.btn-gift-cancel'));
  assert.match(p.confirms[0], /\n금액은 환불되지 않습니다\.$/);
});

test('확인창에서 취소하면 요청을 보내지 않는다', async () => {
  const p = giftbox({ lists: { unused: [received] }, confirmAnswer: false });
  await p.start();
  await click(p.cards()[0].querySelector('.btn-gift-cancel'));
  assert.equal(p.cancels().length, 0);
});

test('취소에 성공하면 본문 없이 요청하고 토스트 후 목록을 다시 불러온다', async () => {
  const p = giftbox({ lists: { unused: [received] } });
  await p.start();
  const before = p.gets().length;
  await click(p.cards()[0].querySelector('.btn-gift-cancel'));
  assert.equal(p.cancels()[0].url, '/api/gifts/22/cancel');
  assert.equal(p.cancels()[0].options.method, 'PATCH');
  assert.equal(p.cancels()[0].options.body, undefined);
  assert.deepEqual(p.toasts, ['교환권이 취소되었습니다.']);
  assert.equal(p.gets().length, before + 1);
  assert.match(p.gets().at(-1).url, /status=unused/);
});

test('처리 중에는 버튼이 잠겨 중복 요청이 나가지 않는다', async () => {
  let resolve;
  const p = giftbox({ lists: { unused: [received] }, cancel: () => new Promise(r => { resolve = r; }) });
  await p.start();
  const btn = p.cards()[0].querySelector('.btn-gift-cancel');
  btn.listeners.click({ stopPropagation() {} });
  await flush();
  btn.listeners.click({ stopPropagation() {} });
  await flush();
  assert.equal(p.cancels().length, 1);
  resolve({ data: {} }); await flush();
});

test('이미 사용된 교환권이면 안내하고 상태를 다시 불러온다', async () => {
  const p = giftbox({ lists: { unused: [received] }, cancel: async () => { throw Object.assign(new Error(''), { code: 'GIFT_ALREADY_USED' }); } });
  await p.start();
  const before = p.gets().length;
  await click(p.cards()[0].querySelector('.btn-gift-cancel'));
  assert.match(p.alerts[0], /이미 사용 완료된 교환권/);
  assert.equal(p.gets().length, before + 1);
  assert.equal(p.toasts.length, 0);
});

test('일시적 실패면 안내만 하고 카드와 버튼을 그대로 둔다', async () => {
  const p = giftbox({ lists: { unused: [received] }, cancel: async () => { throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }); } });
  await p.start();
  const before = p.gets().length;
  const btn = p.cards()[0].querySelector('.btn-gift-cancel');
  await click(btn);
  assert.match(p.alerts[0], /취소하지 못했어요/);
  assert.equal(p.gets().length, before);
  assert.equal(btn.disabled, false);
});

test('401이면 공통 처리에 맡기고 성공 토스트를 띄우지 않는다', async () => {
  const p = giftbox({ lists: { unused: [received] }, cancel: async () => undefined });
  await p.start();
  await click(p.cards()[0].querySelector('.btn-gift-cancel'));
  assert.equal(p.toasts.length, 0);
  assert.equal(p.alerts.length, 0);
});

test('?tab=cancelled로 들어오면 취소 내역을 불러와 취소됨 표시와 취소일을 보여준다', async () => {
  const cancelled = { ...received, status: 'cancelled', cancelledAt: '2026-11-07T00:00:00Z' };
  // 화면은 사용일·받은일과 같이 브라우저의 현지 날짜로 표시한다(실행 시간대에 따라 11.06 또는 11.07).
  const local = new Date(cancelled.cancelledAt);
  const expected = `${local.getFullYear()}.${String(local.getMonth() + 1).padStart(2, '0')}.${String(local.getDate()).padStart(2, '0')}`;
  const p = giftbox({ search: '?tab=cancelled', lists: { cancelled: [cancelled] } });
  await p.start();
  assert.match(p.gets()[0].url, /status=cancelled/);
  assert.equal(p.nodes.get('tab-cancelled').classList.contains('active'), true);
  const card = p.cards()[0];
  assert.match(card.innerHTML, /cancelled-overlay">취소됨/);
  assert.ok(card.innerHTML.includes(`취소일: ${expected}`), card.innerHTML);
  assert.equal(card.querySelector('.btn-gift-cancel'), null);
  assert.equal(card.listeners.click, undefined); // 사용 화면으로 이동하지 않음
});

test('취소됨 탭이 비어 있으면 전용 안내를 보여준다', async () => {
  const p = giftbox({ lists: {} });
  await p.start();
  await p.nodes.get('tab-cancelled').listeners.click(); await flush();
  assert.match(p.list().innerHTML, /취소된 선물이 없습니다/);
});

// ---- giftuse.js ----
function giftuse({ detail, use = async () => ({ data: {} }) }) {
  const nodes = new Map(), alerts = [];
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const listeners = {};
  const document = {
    body: { style: {} },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    getElementById: get
  };
  const window = { location: { search: '?giftId=22', href: '' }, registerBfcacheRevalidation: async fn => fn() };
  const requestJson = async (url, options = {}) => {
    if (url === '/api/auth/me') return { data: { userId: 1 } };
    if (url.endsWith('/use')) return use(url, options);
    return { data: detail };
  };
  const ctx = vm.createContext({
    window, document, requestJson, URLSearchParams, console: { error() {} },
    alert: m => alerts.push(m), confirm: () => true, createSkeletonGuard: () => () => {}, location: window.location
  });
  vm.runInContext(read('giftuse.js'), ctx);
  return { nodes, alerts, start: async () => { await listeners.DOMContentLoaded(); await flush(); }, card: () => get('barcode-card') };
}

test('사용 화면: 취소된 교환권은 바코드·사용 버튼 대신 안내를 보여준다', async () => {
  const p = giftuse({ detail: { giftId: 22, status: 'cancelled', barcode: null, isSelfGift: true } });
  await p.start();
  assert.match(p.card().innerHTML, /취소된 교환권이라 사용할 수 없습니다/);
  assert.doesNotMatch(p.card().innerHTML, /btn-use"[^>]*>선물 사용하기/);
  assert.equal(p.nodes.get('barcode-text')?.textContent ?? '', ''); // 바코드 영역에 값을 쓰지 않음
});

test('사용 화면: 바코드가 없으면 임의의 바코드를 보여주지 않는다', async () => {
  const p = giftuse({ detail: { giftId: 22, status: 'unused', barcode: null, isSelfGift: true } });
  await p.start();
  assert.equal(p.nodes.get('barcode-text')?.textContent ?? '', ''); // 바코드 영역에 값을 쓰지 않음
  assert.match(p.card().innerHTML, /교환권 정보를 확인할 수 없습니다/);
  assert.doesNotMatch(read('giftuse.js'), /2350978230953538/);
});

test('사용 화면: 다른 곳에서 먼저 취소돼 사용이 409 GIFT_CANCELLED면 안내로 바꾼다', async () => {
  const p = giftuse({
    detail: { giftId: 22, status: 'unused', barcode: '1234567812345678', isSelfGift: true },
    use: async () => { throw Object.assign(new Error(''), { code: 'GIFT_CANCELLED' }); }
  });
  await p.start();
  assert.equal(p.nodes.get('barcode-text').textContent, '1234 5678 1234 5678');
  await p.nodes.get('btn-use').listeners.click(); await flush();
  assert.match(p.card().innerHTML, /취소된 교환권이라 사용할 수 없습니다/);
  assert.equal(p.alerts.length, 0);
});

test('계정 확인에서 계정이 바뀐 것으로 나오면 그 안내를 보여주고 요청하지 않는다', async () => {
  const p = giftbox({ lists: { unused: [received] } });
  p.window.accountGuard.ensureAction = async () => {
    p.switchAccount();
    throw Object.assign(new Error('로그인 상태가 변경됐어요. 새로 불러온 화면에서 다시 시도해주세요.'), { code: 'STALE_ACCOUNT' });
  };
  await p.start();
  const btn = p.cards()[0].querySelector('.btn-gift-cancel');
  await click(btn);
  assert.deepEqual(p.alerts, ['로그인 상태가 변경됐어요. 새로 불러온 화면에서 다시 시도해주세요.']);
  assert.equal(p.cancels().length, 0);
  assert.equal(btn.disabled, false);
});

test('취소 응답을 기다리는 사이 계정이 바뀌면 이전 계정의 성공 응답을 보여주지 않는다', async () => {
  let resolve;
  const p = giftbox({ lists: { unused: [received] }, cancel: () => new Promise(r => { resolve = r; }) });
  await p.start();
  const before = p.gets().length;
  p.cards()[0].querySelector('.btn-gift-cancel').listeners.click({ stopPropagation() {} });
  await flush();
  assert.equal(p.cancels().length, 1);
  p.switchAccount();
  resolve({ data: {} }); await flush();
  assert.deepEqual(p.toasts, []);
  assert.deepEqual(p.alerts, []);
  assert.equal(p.gets().length, before);
});

test('취소 응답을 기다리는 사이 계정이 바뀌면 이전 계정의 실패 응답도 보여주지 않는다', async () => {
  let reject;
  const p = giftbox({ lists: { unused: [received] }, cancel: () => new Promise((_, r) => { reject = r; }) });
  await p.start();
  const before = p.gets().length;
  p.cards()[0].querySelector('.btn-gift-cancel').listeners.click({ stopPropagation() {} });
  await flush();
  p.switchAccount();
  reject(Object.assign(new Error(''), { code: 'GIFT_ALREADY_USED' })); await flush();
  assert.deepEqual(p.alerts, []);
  assert.deepEqual(p.toasts, []);
  assert.equal(p.gets().length, before);
});
