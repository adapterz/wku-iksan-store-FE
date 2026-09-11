const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../public/js/cart-sample.js'),'utf8');

// Lightweight DOM contract tests, complemented by real browser + local MySQL tests.
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.textContent = ''; this.attributes = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key,value) { this.attributes[key] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() {}
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const sampleItem = (extras = {}) => ({cartItemId:1,productId:76,name:'커피',brand:'카페',quantity:2,version:1,unitPrice:4500,subtotal:9000,canOrder:true,...extras});
const group = {orderGroupId:3,receiver:{nickname:'수신자'},totalQuantity:2,totalPrice:9000,items:[{name:'커피',unitPrice:4500,quantity:2,subtotal:9000}],message:'안녕'};
const ok = data => ({ok:true,status:200,json:async()=>({data})});
const bad = (status,code) => ({ok:false,status,json:async()=>({status,code})});
async function app(options = {}) {
  const elements = new Map(), calls = [], storage = options.storage || new Map(), listeners = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); };
  for (const id of ['signed-out','completed','workspace','pending','page-error','toast']) el(id).hidden = true;
  el('message').value = ''; el('add-quantity').value = '1'; el('products').value = '76';
  const location = new URL(options.url || 'http://localhost/cart-sample');
  const addEventListener=(type,fn)=>listeners.set(type,fn);
  const context = { document:{getElementById:el,createElement:tag=>new Element(tag),addEventListener,visibilityState:'visible'}, window:{addEventListener}, location,
    history:{replaceState:(_,__,url)=>{location.href = String(url);}}, URL, AbortController,
    crypto:{randomUUID:()=> 'cart-test-0000-0000-000000000001'},
    // Avoid real timers in unit tests; network errors are injected explicitly.
    setTimeout:()=>1, clearTimeout:()=>{},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(options.storageFails)throw new Error('Storage disabled');storage.set(k,v);},removeItem:k=>storage.delete(k)},
    fetch:async (url,request) => {
      calls.push({url,...request});
      if (options.fetch) { const response = await options.fetch(url,request,calls); if (response) return response; }
      if(url==='/api/auth/me') return ok({userId:1,nickname:'Ethan'});
      if(url==='/api/products') return ok([{id:76,name:'커피',price:4500}]);
      if(url==='/api/cart-items') return ok(options.items || [sampleItem()]);
      if(url.startsWith('/api/users/search')) return ok({userId:2,nickname:'수신자'});
      if(url.startsWith('/api/order-groups')) return ok(group);
      throw new Error('Unmocked request: '+url);
    }
  };
  vm.runInNewContext(source,context);
  await flush();
  return {el,calls,storage,location,async event(type){await listeners.get(type)();await flush();},async submit(id){await el(id).onsubmit({preventDefault(){}});await flush();},async click(id){ const pending = el(id).onclick(); await pending; await flush(); },async selectSelf(){el('select-all').checked=true;el('select-all').onchange();el('self').checked=true;el('self').onchange();}};
}
test('empty cart disables checkout; no auth state invented',async()=>{
  const page=await app({items:[]}); assert.equal(page.el('checkout').disabled,true); assert.equal(page.el('workspace').hidden,false); assert.equal(page.el('count').textContent,0);
});
test('unavailable item stays visible and blocks checkout, but is selectable for removal',async()=>{
  const page=await app({items:[sampleItem({canOrder:false})]}); await page.selectSelf(); assert.equal(page.el('checkout').disabled,true);
  const check=page.el('items').children[0].children[0].children[0];check.checked=true;check.onchange();
  assert.equal(page.el('checkout').disabled,true);assert.equal(page.el('remove-selected').disabled,false);
});
test('same stored request is used after network failure and retry',async()=>{
  let attempts=0;
  const page=await app({fetch:async(url,req)=>{if(url==='/api/order-groups'&&req.method==='POST'){if(++attempts===1)throw new Error('network lost');return ok(group);}}});
  await page.selectSelf();await page.click('checkout');assert.equal(page.el('confirm-dialog').open,true);await page.click('confirm-send');
  assert.equal(page.el('pending').hidden,false);assert.equal(page.el('controls').disabled,true);assert.equal(page.storage.size,1);
  await page.click('retry-order');
  const requests=page.calls.filter(call=>call.url==='/api/order-groups');assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
  assert.equal(page.storage.size,0);assert.equal(page.el('completed').hidden,false);assert.equal(page.location.search,'?orderGroupId=3');
});
test('reload restores pending key and explicitly retries without generating a new request',async()=>{
  const saved={key:'previous-key-000000',body:{items:[{cartItemId:99,quantity:2,version:1,expectedUnitPrice:4500}],isSelfGift:true}};
  const page=await app({items:[],storage:new Map([['cart-pending-order:1',JSON.stringify(saved)]])});
  assert.equal(page.el('pending').hidden,false);assert.equal(page.calls.some(c=>c.method==='POST'),false);
  await page.click('retry-order');const sent=page.calls.find(c=>c.url==='/api/order-groups');assert.equal(sent.headers['Idempotency-Key'],saved.key);assert.deepEqual(JSON.parse(sent.body),saved.body);
});
test('definite price conflict unlocks cart for user reconfirmation',async()=>{
  const page=await app({fetch:async(url,req)=>url==='/api/order-groups'&&req.method==='POST'?bad(409,'PRODUCT_PRICE_CHANGED'):null});
  await page.selectSelf();await page.click('confirm-send');assert.equal(page.storage.size,0);assert.equal(page.el('controls').disabled,false);assert.match(page.el('page-error').textContent,/가격이 변경/);
});
test('401 preserves request for same-account retry but clears visible private content',async()=>{
  const page=await app({fetch:async(url,req)=>url==='/api/order-groups'&&req.method==='POST'?bad(401,'UNAUTHORIZED'):null});
  await page.selectSelf();await page.click('confirm-send');assert.equal(page.storage.size,1);assert.equal(page.el('signed-out').hidden,false);assert.equal(page.el('workspace').hidden,true);assert.equal(page.el('items').children.length,0);
});
test('changed login account cannot submit previous account order',async()=>{
  let account=1;const page=await app({fetch:async url=>url==='/api/auth/me'?ok({userId:account,nickname:'account'}):null});
  account=2;await page.selectSelf();await page.click('confirm-send');assert.equal(page.calls.some(c=>c.url==='/api/order-groups'),false);assert.equal(page.storage.size,0);assert.equal(page.el('workspace').hidden,true);
});

test('lost add response reloads committed quantity without repeating POST',async()=>{
  let quantity=1;
  const page=await app({fetch:async(url,req)=>{
    if(url==='/api/cart-items'&&req.method==='GET')return ok([sampleItem({quantity})]);
    if(url==='/api/cart-items'&&req.method==='POST'){quantity++;throw new Error('response lost');}
  }});
  await page.submit('add-form');
  assert.equal(quantity,2);assert.equal(page.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(page.el('items').children[0].children[1].children[1].textContent,'2개');
  assert.equal(page.el('controls').disabled,false);assert.match(page.el('page-error').textContent,/최신 내용/);
});

test('uncertain mutation and failed reload blocks new writes until GET recovery',async()=>{
  let posts=0,reloadBroken=false;
  const page=await app({fetch:async(url,req)=>{
    if(url==='/api/cart-items'&&req.method==='POST'){posts++;reloadBroken=true;throw new Error('lost');}
    if(url==='/api/cart-items'&&req.method==='GET'&&reloadBroken)throw new Error('offline');
  }});
  await page.submit('add-form');assert.equal(page.el('controls').disabled,true);assert.equal(page.el('sync-needed').hidden,false);
  await page.submit('add-form');assert.equal(posts,1);
  reloadBroken=false;await page.click('sync-cart');assert.equal(page.el('controls').disabled,false);assert.equal(page.el('sync-needed').hidden,true);
});

for(const action of ['add','remove','reload'])test('account change blocks stale cart '+action,async()=>{
  let account=1;const page=await app({fetch:async url=>url==='/api/auth/me'?ok({userId:account,nickname:'account'}):null});
  await page.selectSelf();page.el('nickname').value='private';page.el('message').value='private';account=2;
  const before=page.calls.length;
  if(action==='add')await page.submit('add-form');else await page.click(action==='remove'?'remove-selected':'reload');
  assert.equal(page.calls.slice(before).filter(c=>c.url!=='/api/auth/me').length,0);
  assert.equal(page.el('workspace').hidden,true);assert.equal(page.el('items').children.length,0);
  assert.equal(page.el('nickname').value,'');assert.equal(page.el('message').value,'');
});

for(const event of ['focus','pageshow','visibilitychange'])test(event+' clears private content after account change',async()=>{
  let account=1;const page=await app({fetch:async url=>url==='/api/auth/me'?ok({userId:account,nickname:'account'}):null});
  account=2;await page.event(event);assert.equal(page.el('workspace').hidden,true);assert.equal(page.el('items').children.length,0);
});

test('lost deletion response reloads empty cart without duplicate DELETE',async()=>{
  let removed=false;const page=await app({fetch:async(url,req)=>{
    if(req.method==='DELETE'){removed=true;throw new Error('lost');}
    if(url==='/api/cart-items'&&req.method==='GET'&&removed)return ok([]);
  }});
  const button=page.el('items').children[0].children[1].children.at(-1);await button.onclick();await flush();
  assert.equal(page.el('count').textContent,0);assert.equal(page.calls.filter(c=>c.method==='DELETE').length,1);
});

test('receipt includes provided order timestamp',async()=>{
  const page=await app({url:'http://localhost/cart-sample?orderGroupId=3',fetch:async url=>url.startsWith('/api/order-groups/')?ok({...group,createdAt:'2026-09-11T08:00:00Z'}):null});
  assert.ok(page.el('receipt').children.some(c=>c.textContent.startsWith('주문 시각')));
});

test('focus refresh closes old price confirmation and requires reconfirmation',async()=>{
  const page=await app();await page.selectSelf();await page.click('checkout');assert.equal(page.el('confirm-dialog').open,true);
  await page.event('focus');assert.equal(page.el('confirm-dialog').open,false);assert.equal(page.calls.some(c=>c.method==='POST'),false);
});

test('account change offers current cart without prior account receipt id',async()=>{
  let account=1;const page=await app({url:'http://localhost/cart-sample?orderGroupId=3',fetch:async url=>url==='/api/auth/me'?ok({userId:account}):null});
  account=2;await page.event('focus');assert.equal(page.el('login').href,'/cart-sample');assert.equal(page.el('login').textContent,'현재 계정 장바구니 열기');
});
test('storage failure must not send an untrackable order',async()=>{
  const page=await app({storageFails:true});await page.selectSelf();await page.click('confirm-send');assert.equal(page.calls.some(c=>c.url==='/api/order-groups'),false);
});
test('receipt reload and return reloads product choices as well as cart',async()=>{
  const page=await app({url:'http://localhost/cart-sample?orderGroupId=3'});assert.equal(page.el('completed').hidden,false);await page.click('continue');assert.equal(page.el('products').children.length,1);assert.equal(page.el('workspace').hidden,false);assert.equal(page.location.search,'');
});
