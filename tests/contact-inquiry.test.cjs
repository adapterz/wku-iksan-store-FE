const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/mypage.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/mypage.html'), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const iso = offset => new Date(Date.now() + offset).toISOString();

function element() {
  const listeners = {};
  return {
    textContent: '', innerHTML: '', value: '', hidden: false, disabled: false, className: '',
    classList: { items: new Set(), contains(name) { return this.items.has(name); }, add(name) { this.items.add(name); }, remove(name) { this.items.delete(name); } },
    addEventListener(type, fn) { listeners[type] = fn; },
    click() { return listeners.click && listeners.click({ preventDefault() {} }); },
    fire(type) { return listeners[type] && listeners[type]({ preventDefault() {} }); },
    insertAdjacentHTML(position, html) { this.innerHTML += html; },
    listeners
  };
}

// 문의하기 기능만 떼어내 검증한다. mypage.js는 DOMContentLoaded 안에서 인증 확인
// (registerBfcacheRevalidation) 뒤에야 문의하기 리스너를 등록하므로, 그 전까지 거치는
// 다른 영역(선물함 카운트, 정책 오버레이 등)은 참조하는 엘리먼트를 비워 둬서 각 블록이
// 자체 가드(`if (el && ...)`)로 조용히 건너뛰게 한다.
async function page({ respond = async () => ({ data: [], meta: { totalPages: 0 } }) } = {}) {
  const ids = [
    'contact-overlay', 'btn-contact', 'btn-close-contact', 'contact-content',
    'contact-content-count', 'contact-form-error', 'contact-submit',
    'contact-history-list', 'contact-history-more'
  ];
  const nodes = new Map(ids.map(id => [id, element()]));
  const listeners = {};
  const state = { userId: 1 };
  const document = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    getElementById: id => nodes.get(id) || null,
    querySelector: () => null,
    body: { style: {} }
  };
  const window = {
    accountGuard: { currentUser: () => (state.userId === null ? null : { userId: state.userId }) },
    showToast: () => {},
    registerBfcacheRevalidation: async fn => fn(),
    clearClientSession: () => {}
  };
  const calls = [];
  const requestJson = async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/auth/me') {
      return state.userId === null ? undefined : { data: { userId: state.userId, nickname: 'n', role: 'user' } };
    }
    return respond(url, options);
  };
  const ctx = vm.createContext({ window, document, requestJson, console: { error() {} } });
  vm.runInContext(source, ctx);
  listeners.DOMContentLoaded();
  await flush();

  const calledInquiries = () => calls.filter(c => c.url.startsWith('/api/inquiries/me'));
  return {
    state, calls, calledInquiries,
    content: nodes.get('contact-content'),
    error: nodes.get('contact-form-error'),
    historyList: nodes.get('contact-history-list'),
    moreBtn: nodes.get('contact-history-more'),
    overlay: nodes.get('contact-overlay'),
    open: async () => { nodes.get('btn-contact').click(); await flush(); },
    clickMore: async () => { nodes.get('contact-history-more').click(); await flush(); },
    submit: async () => { nodes.get('contact-submit').click(); await flush(); },
    ready: async user => { listeners['account:ready']({ detail: { user } }); await flush(); }
  };
}

test('마이페이지에 문의하기 버튼과 오버레이, 스크립트가 있다', () => {
  assert.match(html, /js\/mypage\.js/);
  assert.match(html, /id="btn-contact"/);
  assert.match(html, /id="contact-overlay"/);
});

test('문의 내역을 조회해 보여준다', async () => {
  const p = await page({ respond: async () => ({ data: [{ inquiryId: 1, status: 'pending', content: 'A', createdAt: iso(0) }], meta: { totalPages: 1 } }) });
  await p.open();
  assert.match(p.calledInquiries()[0].url, /^\/api\/inquiries\/me\?page=1&limit=20$/);
  assert.match(p.historyList.innerHTML, /A/);
  assert.match(p.historyList.innerHTML, /답변대기/);
});

test('같은 계정으로 돌아오면 다시 조회하지 않고 쓰던 글을 유지한다', async () => {
  const p = await page({ respond: async () => ({ data: [{ inquiryId: 1, status: 'pending', content: 'A', createdAt: iso(0) }], meta: { totalPages: 1 } }) });
  await p.open();
  p.content.value = '쓰는 중인 문의';
  await p.ready({ userId: 1 });
  assert.equal(p.calledInquiries().length, 1);
  assert.equal(p.content.value, '쓰는 중인 문의');
});

test('열어 둔 사이 계정이 바뀌면 이전 내역과 쓰던 글을 지우고 새 계정으로 다시 조회한다', async () => {
  let who = 'A';
  const p = await page({ respond: async () => ({ data: [{ inquiryId: 1, status: 'pending', content: who, createdAt: iso(0) }], meta: { totalPages: 1 } }) });
  await p.open();
  p.content.value = 'A가 쓰던 글';
  p.error.textContent = '이전 오류';
  p.state.userId = 2;
  who = 'B';
  await p.ready({ userId: 2 });

  assert.equal(p.calledInquiries().length, 2);
  assert.equal(p.content.value, '');
  assert.equal(p.error.textContent, '');
  assert.match(p.historyList.innerHTML, /B/);
  assert.doesNotMatch(p.historyList.innerHTML, /A가 쓰던 글/);
});

test('닫아 둔 상태에서 계정이 바뀌면 지우기만 하고 다시 조회하지 않는다', async () => {
  const p = await page({ respond: async () => ({ data: [{ inquiryId: 1, status: 'pending', content: 'A', createdAt: iso(0) }], meta: { totalPages: 1 } }) });
  await p.open();
  p.overlay.classList.remove('open');
  p.content.value = '쓰던 글';
  p.state.userId = 2;
  await p.ready({ userId: 2 });

  assert.equal(p.calledInquiries().length, 1);
  assert.equal(p.content.value, '');
  assert.equal(p.historyList.innerHTML, '');
});

test('로그아웃되면 이전 내역과 쓰던 글을 지우고 다시 조회하지 않는다', async () => {
  const p = await page({ respond: async () => ({ data: [{ inquiryId: 1, status: 'pending', content: 'A', createdAt: iso(0) }], meta: { totalPages: 1 } }) });
  await p.open();
  p.content.value = '쓰던 글';
  p.state.userId = null;
  await p.ready(null);

  assert.equal(p.calledInquiries().length, 1);
  assert.equal(p.content.value, '');
  assert.equal(p.historyList.innerHTML, '');
});

test('조회 중 계정이 바뀌면 이전 계정의 응답을 표시하지 않는다', async () => {
  let resolve;
  const p = await page({ respond: () => new Promise(r => { resolve = r; }) });
  await p.open();
  p.state.userId = 2; // account:ready가 아직 오지 않은 상태에서 응답만 늦게 도착
  resolve({ data: [{ inquiryId: 1, status: 'pending', content: 'A', createdAt: iso(0) }], meta: { totalPages: 1 } });
  await flush();
  assert.doesNotMatch(p.historyList.innerHTML, /contact-history-item/);
});

test('등록 직후 재조회보다 먼저 보낸 늦은 조회 응답은 최신 상태를 덮어쓰지 않는다', async () => {
  const resolvers = [];
  const p = await page({
    respond: (url, options) => {
      if (options && options.method === 'POST') return Promise.resolve({ data: { inquiryId: 99 } });
      return new Promise(resolve => resolvers.push(resolve));
    }
  });
  await p.open(); // 1차 조회(지연) 시작 — resolvers[0]
  p.content.value = '새 문의';
  p.content.fire('input');
  await p.submit(); // 등록 성공 → loadContactHistory 재호출(지연) — resolvers[1]

  resolvers[1]({ data: [{ inquiryId: 2, status: 'pending', content: '최신', createdAt: iso(0) }], meta: { totalPages: 1 } });
  await flush();
  resolvers[0]({ data: [{ inquiryId: 1, status: 'pending', content: '오래된', createdAt: iso(0) }], meta: { totalPages: 1 } });
  await flush();

  assert.match(p.historyList.innerHTML, /최신/);
  assert.doesNotMatch(p.historyList.innerHTML, /오래된/);
});

test('더보기 중 재조회가 일어나면 늦게 온 더보기 응답을 버린다', async () => {
  let moreResolve;
  let call = 0;
  const p = await page({
    respond: (url) => {
      call += 1;
      if (call === 1) return Promise.resolve({ data: [{ inquiryId: 1, status: 'pending', content: '1페이지', createdAt: iso(0) }], meta: { totalPages: 2 } });
      if (call === 2) return new Promise(r => { moreResolve = r; }); // 더보기 응답을 지연
      return Promise.resolve({ data: [{ inquiryId: 9, status: 'pending', content: '재조회', createdAt: iso(0) }], meta: { totalPages: 1 } });
    }
  });
  await p.open();
  const more = p.clickMore();
  await flush();
  await p.open(); // 더보기 응답이 오기 전에 재조회(등록 성공 등으로) 발생
  moreResolve({ data: [{ inquiryId: 2, status: 'pending', content: '2페이지-낡음', createdAt: iso(0) }], meta: { totalPages: 2 } });
  await more;
  await flush();

  assert.match(p.historyList.innerHTML, /재조회/);
  assert.doesNotMatch(p.historyList.innerHTML, /2페이지-낡음/);
  // 더보기 버튼은 낡은 응답에도 다음 클릭을 막지 않도록 풀려 있어야 한다.
  assert.equal(p.moreBtn.disabled, false);
});

test('알 수 없는 서버 오류는 사용자용 문구로 보여준다', async () => {
  const p = await page({
    respond: (url, options) => {
      if (options && options.method === 'POST') {
        const e = new Error('Internal error stack trace...');
        e.code = 'INTERNAL_SERVER_ERROR';
        return Promise.reject(e);
      }
      return Promise.resolve({ data: [], meta: { totalPages: 0 } });
    }
  });
  await p.open();
  p.content.value = '문의 내용';
  p.content.fire('input');
  await p.submit();
  assert.equal(p.error.textContent, '문의를 등록하지 못했어요. 잠시 후 다시 시도해주세요.');
});

test('네트워크 오류 안내는 그대로 보여준다', async () => {
  const p = await page({
    respond: (url, options) => {
      if (options && options.method === 'POST') {
        const e = new Error('네트워크 연결을 확인해주세요.');
        e.code = 'NETWORK_ERROR';
        return Promise.reject(e);
      }
      return Promise.resolve({ data: [], meta: { totalPages: 0 } });
    }
  });
  await p.open();
  p.content.value = '문의 내용';
  p.content.fire('input');
  await p.submit();
  assert.equal(p.error.textContent, '네트워크 연결을 확인해주세요.');
});
