const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const pending = { key: 'order-recovery-test-0001', body: { productId: 1, quantity: 2, expectedUnitPrice: 4500, isSelfGift: false, receiverId: 3 } };
const bundlePending = { key: 'bundle-recovery-test-01', body: { items: [{ cartItemId: 11, quantity: 2, version: 1, expectedUnitPrice: 4500 }], isSelfGift: true, receiverId: 1 } };
const networkError = () => Object.assign(new Error('Response lost'), { code: 'NETWORK_ERROR' });
function element() {
  return { style: {}, textContent: '', innerHTML: '', value: '', disabled: false, children: [], events: {},
    classList: { add() {}, remove() {} }, addEventListener(n, f) { this.events[n] = f; },
    replaceChildren() { this.children = []; }, appendChild(c) { this.children.push(c); } };
}
function dom(page) {
  const nodes = new Map([...read(page).matchAll(/id="([^"]+)"/g)].map(m => [m[1], element()]));
  const events = {};
  return { nodes, events, document: { body: element(), addEventListener(n, f) { events[n] = f; },
    // Back navigation is outside this harness; absent nodes are null, not generic fake objects.
    getElementById: id => id === 'btn-back' ? null : nodes.get(id) || null,
    querySelector() { return null; }, createElement: element } };
}
async function orderPage(options = {}) {
  const d = dom('order.html'), calls = [], storage = options.storage || new Map(), alerts = [];
  let userId = 1, reloads = 0, revalidate;
  const replaced = [], winEvents = {};
  const location = { search: options.search || '?productId=1&type=gift&quantity=2', href: '', reload() { reloads++; },
    replace(url) { replaced.push(url); this.href = url; } };
  // history.state는 주문서 히스토리 항목 ID(이슈 #74)를 담는다. 같은 항목으로 다시 들어오는 경우를
  // 흉내내려면 이전 페이지의 history를 options.history로 넘긴다.
  const history = options.history || { state: null, backs: 0, replaceState(state) { this.state = state; },
    pushState(state) { this.state = state; }, back() { this.backs++; } };
  const context = { document: d.document, location, URLSearchParams, console: { error() {} },
    alert: msg => alerts.push(msg), crypto: require('node:crypto'), setTimeout, clearTimeout,
    sessionStorage: { getItem: k => storage.get(k) || null, removeItem: k => storage.delete(k),
      setItem(k, v) { if (options.storageFails) throw Error('Storage unavailable'); storage.set(k, v); } },
    window: { location, addEventListener(n, f) { winEvents[n] = f; }, registerBfcacheRevalidation: async f => { revalidate = f; return f(); } },
    history,
    requestJson: async (url, request = {}) => {
      calls.push({ url, ...request });
      if (url === '/api/auth/me') {
        if (options.authFailure && calls.length > 2) return options.authFailure();
        return userId ? { data: { userId, nickname: 'user' + userId } } : undefined;
      }
      if (request.method === 'POST') return options.post ? options.post(request) : { data: { orderGroupId: 9 } };
      if (url.startsWith('/api/users/search')) return { data: { userId: 3, nickname: 'friend' } };
      if (options.forbidDataLoad) throw Error('Recovery must not load current cart/product');
      if (options.loadData) return options.loadData(url);
      if (url === '/api/cart-items') return { data: options.emptyCart ? [] : [{ cartItemId: 11, productId: 1, canOrder: true, quantity: 2, unitPrice: 4500, subtotal: 9000, version: 1, name: 'coffee' }] };
      return { data: { name: 'coffee', price: 4500 } };
    } };
  vm.createContext(context); vm.runInContext(read('js/order.js'), context); await d.events.DOMContentLoaded();
  return { ...d, context, calls, storage, alerts, location, history, replaced, winEvents, setUser: id => { userId = id; }, reloads: () => reloads,
    revalidate: () => revalidate(), posts: () => calls.filter(c => c.method === 'POST'),
    click: id => d.nodes.get(id).events.click(), async chooseReceiver() { d.nodes.get('receiver-nickname-input').value = 'friend'; await d.nodes.get('btn-search-user').events.click(); } };
}

for (const [kind, search, stored] of [
  ['direct', '?productId=1&type=gift&quantity=2', pending],
  ['bundle', '?cartItemIds=11&type=self', bundlePending]
]) {
  test(`${kind}: tab-only account switch blocks first submission`, async () => {
    const p = await orderPage({ search }); if (kind === 'direct') await p.chooseReceiver();
    p.setUser(2); await p.click('btn-submit-order');
    assert.equal(p.posts().length, 0); assert.equal(p.reloads(), 1);
    assert.ok(p.storage.has(`${kind}-order-pending:1`));
  });
  test(`${kind}: account switch blocks retry and preserves original owner's request`, async () => {
    const storage = new Map([[`${kind}-order-pending:1`, JSON.stringify(stored)]]);
    const p = await orderPage({ search, storage }); p.setUser(2); await p.click('btn-retry-pending-order');
    assert.equal(p.posts().length, 0); assert.equal(p.reloads(), 1);
    assert.equal(storage.get(`${kind}-order-pending:1`), JSON.stringify(stored));
  });
  test(`${kind}: recovery precedes unavailable cart/product and reuses exact request`, async () => {
    const storage = new Map([[`${kind}-order-pending:1`, JSON.stringify(stored)]]);
    const p = await orderPage({ search, storage, forbidDataLoad: true });
    assert.equal(p.location.href, ''); assert.equal(p.document.body.style.visibility, 'visible');
    assert.equal(p.nodes.get('order-form-content').style.display, 'none');
    assert.equal(p.calls.length, 1); await p.click('btn-retry-pending-order');
    assert.equal(p.posts()[0].headers['Idempotency-Key'], stored.key);
    assert.equal(JSON.stringify(p.posts()[0].body), JSON.stringify(stored.body));
    assert.equal(p.location.href, 'complete.html?orderGroupId=9');
    assert.equal(storage.has(`${kind}-order-pending:1`), false);
  });
  test(`${kind}: storage failure blocks POST and leaves submission usable`, async () => {
    const p = await orderPage({ search, storageFails: true }); if (kind === 'direct') await p.chooseReceiver();
    await p.click('btn-submit-order'); assert.equal(p.posts().length, 0);
    assert.equal(p.nodes.get('btn-submit-order').disabled, false);
  });
}
test('bundle: lost response followed by reload and removed cart recovers original key', async () => {
  const p = await orderPage({ search: '?cartItemIds=11&type=self', post: async () => { throw networkError(); } });
  await p.click('btn-submit-order'); assert.equal(p.nodes.get('btn-submit-order').disabled, true);
  const next = await orderPage({ search: '?cartItemIds=11&type=self', storage: p.storage, emptyCart: true, forbidDataLoad: true });
  await next.click('btn-retry-pending-order');
  assert.equal(next.posts()[0].headers['Idempotency-Key'], p.posts()[0].headers['Idempotency-Key']);
});
test('retry after session expiry does not POST or erase pending request', async () => {
  const storage = new Map([['direct-order-pending:1', JSON.stringify(pending)]]);
  const p = await orderPage({ storage }); p.setUser(0); await p.click('btn-retry-pending-order');
  assert.equal(p.posts().length, 0); assert.equal(storage.size, 1);
});
test('auth lookup failure preserves pending request and makes retry available', async () => {
  const storage = new Map([['direct-order-pending:1', JSON.stringify(pending)]]);
  const p = await orderPage({ storage });
  p.context.requestJson = async () => { throw networkError(); };
  await p.click('btn-retry-pending-order');
  assert.equal(p.posts().length, 0); assert.equal(storage.size, 1);
  assert.equal(p.nodes.get('btn-retry-pending-order').disabled, false);
});
test('bfcache account revalidation still requests reload without erasing pending data', async () => {
  const storage = new Map([['direct-order-pending:1', JSON.stringify(pending)]]);
  const p = await orderPage({ storage }); p.setUser(2); await p.revalidate();
  assert.equal(p.reloads(), 1); assert.equal(storage.size, 1);
});
test('empty cart without pending request still redirects to cart', async () => {
  const p = await orderPage({ search: '?cartItemIds=11&type=self', emptyCart: true });
  assert.equal(p.location.href, 'cart.html'); assert.equal(p.posts().length, 0);
});
test('recovery rejection reloads normal form instead of enabling uninitialized product submission', async () => {
  const storage = new Map([['direct-order-pending:1', JSON.stringify(pending)]]);
  const p = await orderPage({ storage, post: async () => { throw Object.assign(Error('unavailable'), { code: 'PRODUCT_UNAVAILABLE' }); } });
  await p.click('btn-retry-pending-order'); assert.equal(p.reloads(), 1); assert.equal(storage.size, 0);
  assert.equal(p.nodes.get('btn-submit-order').disabled, true);
});
test('repeated clicks while retry is in flight only submit once', async () => {
  let finish; const storage = new Map([['direct-order-pending:1', JSON.stringify(pending)]]);
  const p = await orderPage({ storage, post: () => new Promise(resolve => { finish = resolve; }) });
  const first = p.click('btn-retry-pending-order'); await new Promise(setImmediate);
  await p.click('btn-retry-pending-order'); assert.equal(p.posts().length, 1);
  finish({ data: { orderGroupId: 9 } }); await first;
});

function productPage(options = {}) {
  const d = dom('product.html'), calls = [], alerts = [], toasts = [];
  const ctx = { document: d.document, console: { error() {} }, alert: s => alerts.push(s), CustomEvent: function() {},
    window: { dispatchEvent() {}, showToast: s => toasts.push(s) }, requestJson: async (url, request = {}) => {
      calls.push({ url, ...request });
      if (request.method === 'POST') { if (options.success) return { data: {} }; throw networkError(); }
      return options.get ? options.get() : { data: [{ productId: 1, quantity: 2 }] };
    } };
  vm.createContext(ctx); vm.runInContext(read('js/product.js'), ctx); ctx.initBottomSheet(1);
  return { ...d, calls, alerts, toasts, click: () => d.nodes.get('btn-sheet-add-cart').events.click() };
}
test('existing cart entry is not mistaken for successful quantity addition', async () => {
  const p = productPage(); await p.click(); assert.equal(p.toasts.length, 0);
  assert.match(p.alerts[0], /반영 여부.*2개/);
});
test('failed POST and failed GET permit only GET until state is confirmed', async () => {
  let fail = true; const p = productPage({ get: async () => { if (fail) throw networkError(); return { data: [] }; } });
  await p.click(); await p.click(); assert.equal(p.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(p.nodes.get('btn-sheet-cart-label').textContent, '장바구니 확인');
  fail = false; await p.click(); assert.equal(p.calls.filter(c => c.method === 'POST').length, 1);
  assert.match(p.alerts.at(-1), /0개/); assert.equal(p.toasts.length, 0);
});
test('401 during cart recheck does not announce success or permit another POST', async () => {
  const p = productPage({ get: async () => undefined }); await p.click(); await p.click();
  assert.equal(p.calls.filter(c => c.method === 'POST').length, 1); assert.equal(p.toasts.length, 0);
});
test('normal cart addition still reports success', async () => {
  const p = productPage({ success: true }); await p.click();
  assert.deepEqual(p.toasts, ['장바구니에 담았습니다.']); assert.equal(p.calls.length, 1);
});

test('different product URL displays stored request identity without loading new product', async () => {
  const storage = new Map([['direct-order-pending:1', JSON.stringify(pending)]]);
  const p = await orderPage({ search: '?productId=99&type=self&quantity=1', storage, forbidDataLoad:true });
  assert.match(p.nodes.get('pending-order-details').textContent, /상품 #1 · 2개.*회원 #3/);
  assert.equal(p.posts().length,0);
  await p.click('btn-retry-pending-order');
  assert.equal(JSON.stringify(p.posts()[0].body),JSON.stringify(pending.body));
});

for (const [kind, search, saved] of [
  ['direct','?productId=1&type=gift&quantity=2',pending],
  ['bundle','?cartItemIds=11&type=self',bundlePending]
]) test(`${kind}: key conflict preserves original request and blocks repeat/new POST across reload`, async () => {
  const storage = new Map([[`${kind}-order-pending:1`,JSON.stringify(saved)]]);
  const p = await orderPage({search,storage,post:async()=>{throw Object.assign(Error('conflict'),{code:'IDEMPOTENCY_KEY_REUSED'});}});
  await p.click('btn-retry-pending-order');
  const stored=JSON.parse(storage.get(`${kind}-order-pending:1`));
  assert.equal(stored.key,saved.key);assert.deepEqual(stored.body,saved.body);assert.equal(stored.conflict,true);
  assert.equal(p.nodes.get('btn-retry-pending-order').hidden,true);
  assert.equal(p.nodes.get('pending-order-history').hidden,false);
  await p.click('btn-retry-pending-order');await p.click('btn-submit-order');assert.equal(p.posts().length,1);
  const next=await orderPage({search,storage,forbidDataLoad:true});
  await next.click('btn-retry-pending-order');await next.click('btn-submit-order');
  assert.equal(next.posts().length,0);assert.match(next.nodes.get('pending-order-description').textContent,/구매 내역/);
});

test('bundle invalid body is definitive failure, not a persistent retry loop', async () => {
  const storage=new Map([['bundle-order-pending:1',JSON.stringify(bundlePending)]]);
  const p=await orderPage({search:'?cartItemIds=11&type=self',storage,post:async()=>{throw Object.assign(Error('invalid'),{code:'INVALID_ORDER_GROUP_BODY'});}});
  await p.click('btn-retry-pending-order');await p.click('btn-retry-pending-order');
  assert.equal(storage.size,0);assert.equal(p.posts().length,1);assert.equal(p.reloads(),1);
});

test('price refresh with no orderable items blocks another POST and goes to cart', async () => {
  const opts={search:'?cartItemIds=11&type=self'};
  opts.post=async()=>{opts.emptyCart=true;throw Object.assign(Error('price'),{code:'PRODUCT_PRICE_CHANGED'});};
  const p=await orderPage(opts);await p.click('btn-submit-order');
  assert.equal(p.location.href,'cart.html');assert.equal(p.nodes.get('btn-submit-order').disabled,true);
  await p.click('btn-submit-order');assert.equal(p.posts().length,1);assert.equal(p.storage.size,0);
});

test('price refresh blocks concurrent click and enables only after fresh data arrives', async () => {
  let resolveData;
  const opts={search:'?cartItemIds=11&type=self'};
  opts.post=async()=>{opts.loadData=()=>new Promise(resolve=>{resolveData=resolve;});throw Object.assign(Error('price'),{code:'PRODUCT_PRICE_CHANGED'});};
  const p=await orderPage(opts);const first=p.click('btn-submit-order');await new Promise(setImmediate);
  assert.equal(p.nodes.get('btn-submit-order').disabled,true);await p.click('btn-submit-order');assert.equal(p.posts().length,1);
  resolveData({data:[{cartItemId:11,canOrder:true,quantity:2,unitPrice:5000,subtotal:10000,version:2,name:'coffee'}]});await first;
  assert.equal(p.nodes.get('btn-submit-order').disabled,false);
  opts.post=async()=>({data:{orderGroupId:10}});await p.click('btn-submit-order');
  assert.equal(p.posts()[1].body.items[0].expectedUnitPrice,5000);
  assert.notEqual(p.posts()[1].headers['Idempotency-Key'],p.posts()[0].headers['Idempotency-Key']);
});

for(const failed of ['network','401']) test(`price refresh ${failed} keeps stale form blocked`,async()=>{
  const opts={search:'?cartItemIds=11&type=self'};
  opts.post=async()=>{opts.loadData=async()=>{if(failed==='401')return undefined;throw networkError();};throw Object.assign(Error('price'),{code:'PRODUCT_PRICE_CHANGED'});};
  const p=await orderPage(opts);await p.click('btn-submit-order');await p.click('btn-submit-order');
  assert.equal(p.posts().length,1);assert.equal(p.nodes.get('btn-submit-order').disabled,true);
});

test('cart recheck changes only label and never replaces icon-containing button markup', async()=>{
  let fail=true;const p=productPage({get:async()=>{if(fail)throw networkError();return {data:[]};}});
  const button=p.nodes.get('btn-sheet-add-cart');
  for(const field of ['textContent','innerHTML'])Object.defineProperty(button,field,{set(){throw Error('Button markup must remain intact');}});
  await p.click();assert.equal(p.nodes.get('btn-sheet-cart-label').textContent,'장바구니 확인');
  fail=false;await p.click();assert.equal(p.nodes.get('btn-sheet-cart-label').textContent,'장바구니');
  assert.match(read('product.html'),/fa-bag-shopping[\s\S]*?id="btn-sheet-cart-label"/);
});

// 이슈 #74: 결제 완료 후 완료 화면에서 뒤로가기로 같은 주문서 항목에 돌아왔을 때
for (const [kind, search, entryKey, entryValue, fallback] of [
  ['direct', '?productId=1&type=gift&quantity=2', 'orderEntryProductId', '1', 'product.html?id=1'],
  ['bundle', '?cartItemIds=11&type=self', 'orderEntryCartItemIds', '11', 'cart.html']
]) {
  const submit = async p => { if (kind === 'direct') await p.chooseReceiver(); await p.click('btn-submit-order'); };
  const completed = storage => JSON.parse(storage.get('completedOrderEntries') || '[]');

  test(`${kind}: success replaces the order entry with complete page and marks it completed`, async () => {
    const p = await orderPage({ search });
    await submit(p);
    assert.deepEqual(p.replaced, ['complete.html?orderGroupId=9']);
    assert.ok(p.history.state.orderEntryId);
    assert.deepEqual(completed(p.storage), [p.history.state.orderEntryId]);
  });

  test(`${kind}: returning to a completed entry never shows the form or POSTs again`, async () => {
    const first = await orderPage({ search });
    await submit(first);
    const again = await orderPage({ search, storage: first.storage, history: first.history });
    assert.equal(again.calls.length, 0);
    assert.notEqual(again.document.body.style.visibility, 'visible');
    assert.deepEqual(again.replaced, [fallback]);
  });

  test(`${kind}: completed entry reached from its entry page goes back instead of stacking a new page`, async () => {
    const storage = new Map([[entryKey, entryValue]]);
    const first = await orderPage({ search, storage });
    await submit(first);
    // 이후 다른 주문 진입으로 표시가 바뀌어도, 처음 판단해 항목에 기록한 값을 쓴다.
    storage.set(entryKey, 'other');
    const again = await orderPage({ search, storage, history: first.history });
    assert.equal(again.history.backs, 1);
    assert.deepEqual(again.replaced, []);
  });

  test(`${kind}: bfcache restore after completion leaves once per restore`, async () => {
    const p = await orderPage({ search });
    await submit(p);
    assert.equal(await p.revalidate(), false);
    assert.equal(await p.revalidate(), false);
    assert.deepEqual(p.replaced, ['complete.html?orderGroupId=9', fallback]);
    // 떠난 뒤(pagehide) 다시 bfcache로 복원되면 그때 다시 빠져나가야 흰 화면에 머물지 않는다.
    p.winEvents.pagehide();
    await p.revalidate();
    assert.deepEqual(p.replaced, ['complete.html?orderGroupId=9', fallback, fallback]);
  });

  test(`${kind}: a new entry for the same URL after completion is a normal order form`, async () => {
    const first = await orderPage({ search });
    await submit(first);
    const fresh = await orderPage({ search, storage: first.storage });
    assert.ok(fresh.calls.length > 0);
    assert.equal(fresh.document.body.style.visibility, 'visible');
    assert.deepEqual(fresh.replaced, []);
  });
}
