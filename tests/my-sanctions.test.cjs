const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/my-sanctions.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/mypage.html'), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const DAY = 24 * 60 * 60 * 1000;
const iso = offset => new Date(Date.now() + offset).toISOString();

function element(tag = 'div') {
  const listeners = {};
  return {
    tag, children: [], textContent: '', hidden: false, className: '', listeners,
    classList: { items: new Set(), contains(name) { return this.items.has(name); }, add(name) { this.items.add(name); }, remove(name) { this.items.delete(name); } },
    addEventListener(type, fn) { listeners[type] = fn; },
    click() { return listeners.click(); },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; }
  };
}

function page({ respond = async () => ({ data: [], meta: { totalCount: 0 } }), hasOverlayOpen = true } = {}) {
  const nodes = new Map(['btn-policy-penalty', 'policy-penalty-overlay', 'my-sanctions-message', 'my-sanctions-list', 'my-sanctions-retry'].map(id => [id, element()]));
  if (hasOverlayOpen) nodes.get('policy-penalty-overlay').classList.add('open');
  const listeners = {}, calls = [];
  const state = { userId: 1 };
  const document = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    getElementById: id => nodes.get(id) || null,
    createElement: element
  };
  const window = {
    accountGuard: { currentUser: () => (state.userId === null ? null : { userId: state.userId }) },
    requestJson: async (url, options) => { calls.push({ url, options }); return respond(url, options); }
  };
  const ctx = vm.createContext({ window, document, AbortController, console: { error() {} }, Date });
  vm.runInContext(source, ctx);
  listeners.DOMContentLoaded();
  return {
    state, calls, list: nodes.get('my-sanctions-list'), message: nodes.get('my-sanctions-message'), retry: nodes.get('my-sanctions-retry'),
    overlay: nodes.get('policy-penalty-overlay'),
    open: async () => { nodes.get('btn-policy-penalty').click(); await flush(); },
    ready: async user => { listeners['account:ready']({ detail: { user } }); await flush(); }
  };
}

const rendered = item => ({
  badge: item.children[0].children[0].textContent,
  tone: item.children[0].children[0].className.split(' ')[1],
  date: item.children[0].children[1].textContent,
  reason: item.children[1].textContent,
  period: item.children[2]?.textContent
});

test('마이페이지에 내역 영역과 스크립트가 있고, 내역이 정책 본문보다 먼저 나온다', () => {
  assert.match(html, /js\/my-sanctions\.js/);
  assert.ok(html.indexOf('my-sanctions-title') < html.indexOf('<h2>패널티 정책</h2>'));
  assert.ok(html.indexOf('my-sanctions-title') > html.indexOf('policy-penalty-overlay'));
});

test('최대 개수로 조회하고 경고 내용을 표시한다', async () => {
  const p = page({ respond: async () => ({ data: [{ sanctionId: 1, type: 'warning', status: 'active', reason: '욕설', endsAt: null, createdAt: iso(-DAY) }], meta: { totalCount: 1 } }) });
  await p.open();
  assert.match(p.calls[0].url, /^\/api\/users\/me\/sanctions\?limit=50$/);
  const item = rendered(p.list.children[0]);
  assert.equal(item.badge, '경고');
  assert.equal(item.tone, 'warning');
  assert.equal(item.reason, '욕설');
  assert.match(item.date, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.equal(item.period, undefined);
  assert.equal(p.message.hidden, true);
});

test('정지는 종료 시각으로 진행 중과 종료를 구분한다 (BE는 기간이 끝나도 status가 active)', async () => {
  const p = page({ respond: async () => ({ data: [
    { type: 'suspension', status: 'active', reason: '진행', endsAt: iso(DAY), createdAt: iso(-DAY) },
    { type: 'suspension', status: 'active', reason: '끝남', endsAt: iso(-DAY), createdAt: iso(-2 * DAY) }
  ], meta: { totalCount: 2 } }) });
  await p.open();
  const [running, ended] = p.list.children.map(rendered);
  assert.equal(running.badge, '정지');
  assert.equal(running.tone, 'suspension');
  assert.match(running.period, /^기간: \d{4}\.\d{2}\.\d{2}까지$/);
  assert.equal(ended.badge, '정지 종료');
  assert.equal(ended.tone, 'ended');
  assert.match(ended.period, /^기간: /);
});

test('해제된 건은 해제됨으로 표시하고 정지 기간을 숨긴다', async () => {
  const p = page({ respond: async () => ({ data: [
    { type: 'suspension', status: 'lifted', reason: '해제 정지', endsAt: iso(DAY), createdAt: iso(-DAY) },
    { type: 'warning', status: 'lifted', reason: '해제 경고', endsAt: null, createdAt: iso(-DAY) }
  ], meta: { totalCount: 2 } }) });
  await p.open();
  const [suspension, warning] = p.list.children.map(rendered);
  assert.equal(suspension.badge, '정지·해제됨');
  assert.equal(suspension.tone, 'ended');
  assert.equal(suspension.period, undefined);
  assert.equal(warning.badge, '경고·해제됨');
  assert.equal(warning.tone, 'ended');
});

test('사유의 HTML은 글자로만 넣는다', async () => {
  const reason = '<img src=x onerror=alert(1)>';
  const p = page({ respond: async () => ({ data: [{ type: 'warning', status: 'active', reason, createdAt: iso(0) }], meta: { totalCount: 1 } }) });
  await p.open();
  assert.equal(rendered(p.list.children[0]).reason, reason);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML/);
});

test('내역이 없으면 빈 상태를 안내한다', async () => {
  const p = page();
  await p.open();
  assert.equal(p.list.children.length, 0);
  assert.equal(p.message.textContent, '받은 경고나 제재가 없어요.');
  assert.equal(p.message.hidden, false);
  assert.equal(p.retry.hidden, true);
});

test('표시 한도를 넘으면 일부만 보인다고 안내한다', async () => {
  const data = Array.from({ length: 50 }, () => ({ type: 'suspension', status: 'lifted', reason: 'r', createdAt: iso(0) }));
  const p = page({ respond: async () => ({ data, meta: { totalCount: 60 } }) });
  await p.open();
  assert.equal(p.list.children.length, 50);
  assert.match(p.message.textContent, /최근 50건/);
  assert.equal(p.message.hidden, false);
});

test('조회에 실패하면 안내와 다시 시도를 보여주고, 다시 시도로 복구한다', async () => {
  let fail = true;
  const p = page({ respond: async () => {
    if (fail) throw new Error('offline');
    return { data: [{ type: 'warning', status: 'active', reason: '복구', createdAt: iso(0) }], meta: { totalCount: 1 } };
  } });
  await p.open();
  assert.equal(p.message.textContent, '내역을 불러오지 못했어요.');
  assert.equal(p.retry.hidden, false);
  fail = false;
  p.retry.click();
  await flush();
  assert.equal(p.retry.hidden, true);
  assert.equal(p.list.children.length, 1);
});

test('401이면 공통 로그인 이동에 맡기고 실패 안내를 띄우지 않는다', async () => {
  const p = page({ respond: async () => undefined });
  await p.open();
  assert.equal(p.retry.hidden, true);
  assert.notEqual(p.message.textContent, '내역을 불러오지 못했어요.');
});

test('다시 열면 이전 조회를 취소하고 늦게 온 이전 응답을 무시한다', async () => {
  const resolvers = [];
  const p = page({ respond: (url, options) => new Promise(resolve => resolvers.push({ resolve, options })) });
  await p.open();
  await p.open();
  assert.equal(resolvers[0].options.signal.aborted, true);
  resolvers[1].resolve({ data: [{ type: 'warning', status: 'active', reason: '최신', createdAt: iso(0) }], meta: { totalCount: 1 } });
  await flush();
  resolvers[0].resolve({ data: [{ type: 'warning', status: 'active', reason: '이전', createdAt: iso(0) }], meta: { totalCount: 1 } });
  await flush();
  assert.equal(rendered(p.list.children[0]).reason, '최신');
});

test('같은 계정으로 탭 복귀하면 다시 조회하지 않는다', async () => {
  const p = page({ respond: async () => ({ data: [{ type: 'warning', status: 'active', reason: 'r', createdAt: iso(0) }], meta: { totalCount: 1 } }) });
  await p.open();
  await p.ready({ userId: 1 });
  assert.equal(p.calls.length, 1);
  assert.equal(p.list.children.length, 1);
});

test('열어 둔 사이 계정이 바뀌면 이전 내역을 지우고 새 계정으로 다시 조회한다', async () => {
  const p = page({ respond: async () => ({ data: [{ type: 'warning', status: 'active', reason: 'A', createdAt: iso(0) }], meta: { totalCount: 1 } }) });
  await p.open();
  p.state.userId = 2;
  await p.ready({ userId: 2 });
  assert.equal(p.calls.length, 2);
});

test('닫아 둔 상태에서 계정이 바뀌면 지우기만 하고 조회하지 않는다', async () => {
  const p = page({ respond: async () => ({ data: [{ type: 'warning', status: 'active', reason: 'A', createdAt: iso(0) }], meta: { totalCount: 1 } }) });
  await p.open();
  p.overlay.classList.remove('open');
  p.state.userId = 2;
  await p.ready({ userId: 2 });
  assert.equal(p.calls.length, 1);
  assert.equal(p.list.children.length, 0);
});

test('로그아웃되면 이전 내역을 지우고 조회하지 않는다', async () => {
  const p = page({ respond: async () => ({ data: [{ type: 'warning', status: 'active', reason: 'A', createdAt: iso(0) }], meta: { totalCount: 1 } }) });
  await p.open();
  p.state.userId = null;
  await p.ready(null);
  assert.equal(p.calls.length, 1);
  assert.equal(p.list.children.length, 0);
});

test('조회 중 계정이 바뀌면 이전 계정의 응답을 표시하지 않는다', async () => {
  let resolve;
  const p = page({ respond: () => new Promise(r => { resolve = r; }) });
  await p.open();
  p.state.userId = 2; // 아직 account:ready 전
  resolve({ data: [{ type: 'warning', status: 'active', reason: 'A', createdAt: iso(0) }], meta: { totalCount: 1 } });
  await flush();
  assert.equal(p.list.children.length, 0);
});
