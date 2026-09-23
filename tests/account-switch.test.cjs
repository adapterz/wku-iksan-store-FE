const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
    async fire(name, detail = {}) { await Promise.all((listeners.get(name) || []).map(fn => fn({ type: name, ...detail }))); await flush(); }
  };
}
function element() {
  const classes = new Set(), el = target();
  return Object.assign(el, {
    innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, dataset: {}, children: [],
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
    setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; this.innerHTML = ''; },
    insertAdjacentHTML() {}, contains() { return true; }
  });
}
function page(extraRequest = async () => ({ data: [] })) {
  let userId = 1, authFailure = null, authWait = null;
  const elements = new Map(), timers = [], alerts = [], redirects = [], calls = [];
  const document = Object.assign(target(), { body: null, visibilityState: 'visible',
    getElementById: id => elements.get(id) || null,
    querySelector: selector => selector === 'main' ? elements.get('main') : null,
    querySelectorAll: () => [], createElement: element
  });
  const window = Object.assign(target(), { location: { href: 'https://example.test/giftbox', search: '', replace: url => redirects.push(url) } });
  const requestJson = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/auth/me') {
      if (authWait) return authWait.promise;
      if (authFailure) throw authFailure;
      if (!userId) throw { status: 401 };
      return { data: { userId, nickname: 'user' + userId } };
    }
    return extraRequest(url, options);
  };
  window.requestJson = requestJson;
  const ctx = vm.createContext({ window, document, requestJson, location: window.location,
    console: { error() {}, log() {} }, alert: message => alerts.push(message),
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, AbortController, URLSearchParams,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { length: 0 },
  });
  const run = name => vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8'), ctx);
  run('component.js');
  return { ctx, window, document, elements, timers, alerts, redirects, calls, run,
    add(id) { const el = element(); elements.set(id, el); return el; },
    user(id) { userId = id; }, authError(error) { authFailure = error; }, authDeferred(d) { authWait = d; },
    guard: window.accountGuard
  };
}

test('authentication is singleflight; network failure does not turn a verified user into signed-out', async () => {
  const p = page();
  await Promise.all([p.guard.refresh(), p.guard.refresh(), p.guard.refresh()]);
  assert.equal(p.calls.filter(x => x.url === '/api/auth/me').length, 1);
  const owner = p.guard.snapshot();
  p.authError(new Error('offline'));
  await assert.rejects(p.guard.ensureAction(owner), /offline/);
  assert.equal(p.guard.currentUser().userId, 1);
  assert.equal(p.redirects.length, 0);
});

test('late authentication response cannot overwrite a newer identity', async () => {
  const p = page(), old = deferred();
  p.authDeferred(old);
  const request = p.guard.refresh();
  const rejected = assert.rejects(request, { code: 'STALE_ACCOUNT' });
  p.guard.invalidate(); p.authDeferred(null); p.user(2);
  await p.guard.refresh(); old.resolve({ data: { userId: 1 } }); await rejected;
  assert.equal(p.guard.currentUser().userId, 2);
});

test('focus and visibility restore coalesce; private views clear before authentication finishes', async () => {
  const p = page(); let clear = 0, loads = 0, errors = 0;
  p.window.registerAccountView({ clear: () => clear++, load: () => loads++, error: () => errors++ });
  await flush();
  // Only the lifecycle registration: unrelated header DOM setup is not part of this fixture.
  p.document.listeners.get('DOMContentLoaded')[0]();
  const previous = p.guard.snapshot(), slow = deferred(); p.authDeferred(slow);
  await p.window.fire('focus'); await p.document.fire('visibilitychange');
  assert.equal(clear, 2); assert.equal(p.guard.isCurrent(previous), false);
  assert.equal(p.timers.length, 1);
  p.timers.shift()(); await flush();
  slow.resolve({ data: { userId: 2 } }); await flush();
  assert.equal(loads, 2); assert.equal(errors, 0);
});

test('restored authentication failure reports retry state and later recovery reloads the view', async () => {
  const p = page(); let errors = 0, loads = 0;
  p.window.registerAccountView({ clear() {}, load: () => loads++, error: () => errors++ }); await flush();
  p.guard.invalidate(); p.authError(new Error('offline'));
  await assert.rejects(p.guard.refresh()); assert.equal(errors, 1); assert.equal(p.redirects.length, 0);
  p.authError(null); await p.guard.refresh(); await flush(); assert.equal(loads, 2);
});

test('late wishlist response cannot overwrite the new account cache or clear its pending request', async () => {
  const first = deferred(), second = deferred(); let reads = 0;
  const p = page(url => url === '/api/wishlists' ? (++reads === 1 ? first.promise : second.promise) : Promise.resolve({ data: [] }));
  await p.guard.refresh(); const old = p.ctx.ensureWishlistLoaded();
  const rejected = assert.rejects(old, { code: 'STALE_ACCOUNT' });
  p.user(2); await p.guard.refresh(); const current = p.ctx.ensureWishlistLoaded();
  const pending = p.window._wishlistFetchPromise;
  first.resolve({ data: [{ product: { id: 10 } }] }); await rejected;
  assert.equal(p.window._wishlistFetchPromise, pending);
  second.resolve({ data: [{ product: { id: 20 } }] }); await current;
  assert.deepEqual(Array.from(p.window._wishlistCache), ['20']);
});

test('wishlist click after account switch does not send DELETE or POST for the new account', async () => {
  const p = page(); await p.guard.refresh(); p.window._wishlistCache = ['10']; p.user(2);
  await assert.rejects(p.window.toggleSavedProduct(10), { code: 'STALE_ACCOUNT' });
  assert.equal(p.calls.some(x => ['DELETE', 'POST'].includes(x.options.method)), false);
  assert.equal(p.window._wishlistCache, null);
});

test('late wishlist mutation cannot publish a saved event in another account', async () => {
  const mutation = deferred();
  const p = page((url, options) => options.method === 'DELETE' ? mutation.promise : Promise.resolve({ data: [] }));
  await p.guard.refresh(); p.window._wishlistCache = ['10'];
  let events = 0; p.window.addEventListener('saved-products-updated', () => events++);
  const action = p.window.toggleSavedProduct(10); const rejected = assert.rejects(action, { code: 'STALE_ACCOUNT' }); await flush();
  p.user(2); await p.guard.refresh(); mutation.resolve({ data: {} }); await rejected;
  assert.equal(events, 0); assert.equal(p.window._wishlistCache, null);
});

test('late gift notification list/details cannot reopen or refill previous account modal', async () => {
  const list = deferred(), detail = deferred(); let lists = 0;
  const p = page(url => url === '/api/gifts/unnotified' ? (++lists === 1 ? list.promise : Promise.resolve({ data: { count: 0 } })) : detail.promise);
  const modal = p.add('gift-arrival-modal'), content = p.add('gift-arrival-list'); p.add('gift-arrival-count');
  await p.guard.refresh(); p.user(2); await p.guard.refresh();
  list.resolve({ data: { count: 1, giftIds: [10] } }); await flush(); assert.equal(modal.classList.contains('open'), false);
  const displayed = p.window.showGiftArrivalModal(1, [20]); await flush();
  p.user(3); await p.guard.refresh(); detail.resolve({ data: { productName: 'private user2' } }); await displayed;
  assert.equal(modal.classList.contains('open'), false); assert.equal(content.innerHTML, '');
});

test('gift acknowledgement verifies owner; previous IDs are never submitted under new account', async () => {
  const p = page(async () => ({ data: {} })); p.add('gift-arrival-modal'); p.add('gift-arrival-list');
  await p.guard.refresh(); await p.window.showGiftArrivalModal(1, [10]); p.user(2);
  assert.equal(await p.ctx.notifyGiftArrivalSeen(), 'changed');
  assert.equal(p.calls.some(x => x.options.method === 'PATCH'), false);
});

test('logout clears private state and redirects protected views', async () => {
  const p = page(); let clears = 0;
  p.window.registerAccountView({ clear: () => clears++, load() {}, error() {} }); await flush();
  p.window._wishlistCache = ['10']; p.user(null); await p.guard.refresh(); await flush();
  assert.equal(p.window._wishlistCache, null); assert.ok(clears > 1);
  assert.match(p.redirects[0], /^login\.html\?redirect=/);
});

test('order completion discards previous account response and hides old result during revalidation', async () => {
  const old = deferred(); let orders = 0;
  const p = page(url => url.startsWith('/api/orders/') ? (++orders === 1 ? old.promise : Promise.reject({ status: 404 })) : Promise.resolve({ data: {} }));
  p.document.body = element(); const main = p.add('main'); p.window.location.search = '?orderId=10';
  p.run('complete.js'); const rendered = []; p.ctx.renderCompletePage = data => rendered.push(data);
  await p.document.fire('header:ready'); await flush();
  p.user(2); await p.guard.refresh(); await flush();
  old.resolve({ data: { private: 'A order' } }); await flush();
  assert.equal(rendered.length, 0); assert.equal(main.hidden, true);
  assert.equal(p.window.location.href, 'index.html');
});

test('giftbox ignores late list response after switching account or filter', async () => {
  const old = deferred(); let lists = 0;
  const p = page(url => url.startsWith('/api/gifts?') ? (++lists === 1 ? old.promise : Promise.resolve({ data: [] })) : Promise.resolve({ data: {} }));
  p.document.body = element(); const list = p.add('gift-list-container'); p.add('tab-unused'); p.add('tab-used');
  p.run('giftbox.js'); p.ctx.createSkeletonGuard = () => () => {};
  await p.document.fire('header:ready'); await flush();
  p.user(2); await p.guard.refresh(); await flush(); const expected = list.innerHTML;
  old.resolve({ data: [{ giftId: 10, productName: 'A gift' }] }); await flush();
  assert.equal(list.innerHTML, expected); assert.match(expected, /미사용 선물이 없습니다/);
});

test('wishlist loader checks identity before mapResults writes the shared cache', async () => {
  const old = deferred(), p = page(); const list = element(); let mappings = 0;
  p.ctx.createSkeletonGuard = () => () => {};
  await p.guard.refresh();
  const loader = p.window.createProductListLoader(list, {
    buildRequestPath: () => '/api/wishlists', accountScoped: true,
    mapResults: () => { mappings++; return []; }, request: () => old.promise
  });
  const loading = loader.load(null, { showSkeleton: false });
  p.user(2); await p.guard.refresh(); loader.cancel(); loader.renderMessage('B state');
  old.resolve({ data: [{ product: { id: 1 } }] }); await loading;
  assert.equal(mappings, 0); assert.match(list.innerHTML, /B state/);
});

test('previous account 401 cannot redirect the current wishlist owner', async () => {
  const old = deferred(), p = page(); const list = element();
  p.ctx.createSkeletonGuard = () => () => {}; await p.guard.refresh();
  const loader = p.window.createProductListLoader(list, {
    buildRequestPath: () => '/api/wishlists', accountScoped: true,
    request: (url, options) => { assert.equal(options.silent401, true); return old.promise; }
  });
  const loading = loader.load(null, { showSkeleton: false });
  p.user(2); await p.guard.refresh(); old.reject({ status: 401 }); await loading;
  assert.equal(p.redirects.length, 0);
});

test('normal wishlist toggle and gift acknowledgement still submit once', async () => {
  const p = page(async () => ({ data: {} })); p.add('gift-arrival-modal'); p.add('gift-arrival-list');
  await p.guard.refresh(); p.window._wishlistCache = ['10'];
  assert.equal(await p.window.toggleSavedProduct(10), false);
  assert.deepEqual(Array.from(p.window._wishlistCache), []);
  await p.window.showGiftArrivalModal(1, [20]);
  assert.equal(await p.ctx.notifyGiftArrivalSeen(), 'success');
  assert.equal(p.calls.filter(x => x.options.method === 'DELETE').length, 1);
  assert.equal(p.calls.filter(x => x.options.method === 'PATCH').length, 1);
});

test('normal order completion renders; restored same-account view reloads without retaining old result', async () => {
  let orders = 0;
  const p = page(async url => ({ data: url.startsWith('/api/orders/') ? { orderId: ++orders } : {} }));
  p.document.body = element(); const main = p.add('main'); p.window.location.search = '?orderId=10';
  p.run('complete.js'); let renders = 0; p.ctx.renderCompletePage = () => renders++;
  await p.document.fire('header:ready'); await flush(); assert.equal(renders, 1); assert.equal(main.hidden, false);
  p.guard.invalidate(); assert.equal(main.hidden, true);
  await p.guard.refresh(); await flush(); assert.equal(renders, 2); assert.equal(main.hidden, false);
});

test('failed gift acknowledgement preserves pending IDs for a deliberate retry', async () => {
  let fail = true;
  const p = page(async (url, options) => {
    if (options.method === 'PATCH' && fail) throw new Error('offline');
    return { data: {} };
  });
  p.add('gift-arrival-modal'); p.add('gift-arrival-list');
  await p.guard.refresh(); await p.window.showGiftArrivalModal(1, [20]);
  assert.equal(await p.ctx.notifyGiftArrivalSeen(), 'failed'); fail = false;
  assert.equal(await p.ctx.notifyGiftArrivalSeen(), 'success');
  assert.equal(p.calls.filter(x => x.options.method === 'PATCH').length, 2);
});

test('giftbox filter change ignores a late response even within the same account', async () => {
  const old = deferred(); let lists = 0;
  const p = page(url => url.startsWith('/api/gifts?') ? (++lists === 1 ? old.promise : Promise.resolve({ data: [] })) : Promise.resolve({ data: {} }));
  p.document.body = element(); const list = p.add('gift-list-container'); p.add('tab-unused'); const used = p.add('tab-used');
  p.run('giftbox.js'); p.ctx.createSkeletonGuard = () => () => {};
  await p.document.fire('header:ready'); await flush();
  await used.fire('click'); const expected = list.innerHTML;
  old.resolve({ data: [{ giftId: 10 }] }); await flush();
  assert.equal(list.innerHTML, expected); assert.match(expected, /사용완료 선물이 없습니다/);
});

test('wishlist page subscribes beyond its first load and replaces old-account content', async () => {
  let lists = 0;
  const p = page(async url => ({ data: url === '/api/wishlists' ? (lists++, []) : {} }));
  p.document.body = element(); const list = p.add('wishlist-product-list');
  p.ctx.createSkeletonGuard = () => () => {};
  p.ctx.createSkeletonCard = element;
  p.run('wishlist.js');
  p.document.listeners.get('DOMContentLoaded').at(-1)(); await flush();
  assert.equal(lists, 1); list.innerHTML = 'private A list';
  p.user(2); await p.guard.refresh(); await flush();
  assert.equal(lists, 2); assert.equal(list.innerHTML.includes('private A'), false);
});

test('late gift acknowledgement does not clear the new account notification IDs', async () => {
  const old = deferred(); let writes = 0;
  const p = page((url, options) => options.method === 'PATCH' && ++writes === 1 ? old.promise : Promise.resolve({ data: {} }));
  p.add('gift-arrival-modal'); p.add('gift-arrival-list');
  await p.guard.refresh(); await p.window.showGiftArrivalModal(1, [10]);
  const ack = p.ctx.notifyGiftArrivalSeen(); await flush();
  p.user(2); await p.guard.refresh(); await p.window.showGiftArrivalModal(1, [20]);
  old.resolve({ data: {} }); assert.equal(await ack, 'changed');
  assert.equal(await p.ctx.notifyGiftArrivalSeen(), 'success');
  assert.deepEqual(Array.from(p.calls.filter(x => x.options.method === 'PATCH')[1].options.body.giftIds), [20]);
});
