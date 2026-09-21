const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../public/js/cart.js'),'utf8');
const apiSource = fs.readFileSync(path.join(__dirname,'../public/js/api.js'),'utf8');

// Lightweight DOM contract tests, complemented by real browser + local MySQL tests.
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.textContent = ''; this.attributes = {}; this.style = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key,value) { this.attributes[key] = value; }
  focus() {}
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const sampleItem = (extras = {}) => ({cartItemId:1,productId:76,name:'커피',brand:'카페',quantity:2,version:1,unitPrice:4500,subtotal:9000,canOrder:true,...extras});
const ok = data => ({ok:true,status:200,json:async()=>({data})});
const bad = (status,code) => ({ok:false,status,json:async()=>({status,code})});
async function app(options = {}) {
  const elements = new Map(), calls = [], storage = options.storage || new Map(), listeners = new Map(), emitted = [];
  const el = id => { if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); };
  for (const id of ['signed-out','workspace','page-error','toast']) el(id).hidden = true;
  const location = new URL(options.url || 'http://localhost/cart');
  const addEventListener=(type,fn)=>listeners.set(type,fn);
  const context = { document:{getElementById:el,createElement:tag=>new Element(tag),addEventListener,visibilityState:'visible'}, window:{addEventListener,dispatchEvent:event=>emitted.push(event.type)}, CustomEvent:class {constructor(type){this.type=type;}}, location,
    history:{replaceState:(_,__,url)=>{location.href = String(url);}}, URL, AbortController,
    crypto:{randomUUID:()=> 'cart-test-0000-0000-000000000001'},
    // Avoid real timers in unit tests; network errors are injected explicitly.
    setTimeout:()=>1, clearTimeout:()=>{},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(options.storageFails)throw new Error('Storage disabled');storage.set(k,v);},removeItem:k=>storage.delete(k)},
    fetch:async (url,request) => {
      calls.push({url,...request});
      if (options.fetch) { const response = await options.fetch(url,request,calls); if (response) return response; }
      if(url==='/api/auth/me') return ok({userId:1,nickname:'Ethan'});
      if(url==='/api/cart-items') return ok(options.items || [sampleItem()]);
      throw new Error('Unmocked request: '+url);
    }
  };
  vm.createContext(context);
  vm.runInContext(apiSource,context);
  vm.runInContext(source,context);
  await flush();
  return {el,calls,storage,location,emitted,
    async event(type){await listeners.get(type)();await flush();},
    async click(id){ const pending = el(id).onclick(); await pending; await flush(); },
    selectAll(){ el('select-all').checked=true; el('select-all').onchange(); },
    selectItem(index){ const check=el('items').children[index].children[0].children[0]; check.checked=true; check.onchange(); }
  };
}
test('empty cart disables order buttons; no auth state invented',async()=>{
  const page=await app({items:[]}); assert.equal(page.el('btn-order-self').disabled,true); assert.equal(page.el('btn-order-gift').disabled,true); assert.equal(page.el('workspace').hidden,false); assert.equal(page.el('count').textContent,0);
});

test('partial selection has indeterminate state and resets on all/none selection',async()=>{
  const p=await app({items:[sampleItem(),sampleItem({cartItemId:2,productId:77})]});
  p.selectItem(0);assert.equal(p.el('select-all').checked,false);assert.equal(p.el('select-all').indeterminate,true);
  p.selectAll();assert.equal(p.el('select-all').checked,true);assert.equal(p.el('select-all').indeterminate,false);
  p.el('select-all').checked=false;p.el('select-all').onchange();
  assert.equal(p.el('select-all').indeterminate,false);
});

for(const action of ['quantity','delete','selected-delete'])test(`${action} publishes cart change for badge refresh`,async()=>{
  const p=await app({fetch:async(url,req)=>req.method!=='GET'?ok({}):null});
  const controls=p.el('items').children[0].children[1];
  if(action==='selected-delete'){p.selectAll();await p.click('remove-selected');}
  else {await controls.children[action==='quantity'?0:controls.children.length-1].onclick();await flush();}
  assert.deepEqual(p.emitted,['cart-updated']);
});
test('unavailable item stays visible and blocks order, but is selectable for removal',async()=>{
  const page=await app({items:[sampleItem({canOrder:false})]}); page.selectAll(); assert.equal(page.el('btn-order-self').disabled,true);
  const check=page.el('items').children[0].children[0].children[0];check.checked=true;check.onchange();
  assert.equal(page.el('btn-order-self').disabled,true);assert.equal(page.el('remove-selected').disabled,false);
});
test('order buttons enable with a single selected item',async()=>{
  const page=await app({items:[sampleItem({cartItemId:1})]});
  page.selectItem(0);
  assert.equal(page.el('btn-order-self').disabled,false);assert.equal(page.el('btn-order-gift').disabled,false);
});
test('order buttons also enable with multiple selected items (bundle order)',async()=>{
  const page=await app({items:[sampleItem({cartItemId:1}),sampleItem({cartItemId:2,productId:77})]});
  page.selectItem(0);page.selectItem(1);
  assert.equal(page.el('btn-order-self').disabled,false);assert.equal(page.el('btn-order-gift').disabled,false);
});
test('나에게 선물하기 navigates to order.html with all selected cartItemIds and type=self',async()=>{
  const page=await app({items:[sampleItem({cartItemId:5}),sampleItem({cartItemId:9,productId:77})]});
  page.selectItem(0);page.selectItem(1);
  await page.click('btn-order-self');
  assert.equal(page.location.pathname,'/order.html');
  assert.equal(page.location.search,'?cartItemIds=5,9&type=self');
});
test('선물하기 navigates to order.html with type=gift',async()=>{
  const page=await app({items:[sampleItem({cartItemId:5})]}); page.selectItem(0);
  await page.click('btn-order-gift');
  assert.equal(page.location.pathname,'/order.html');
  assert.equal(page.location.search,'?cartItemIds=5&type=gift');
});
test('clicking a disabled order button does nothing',async()=>{
  const page=await app({items:[]});
  await page.click('btn-order-self');
  assert.equal(page.location.pathname,'/cart');
  assert.equal(page.calls.some(c=>c.url.startsWith('order.html')),false);
});

for(const action of ['remove','reload'])test('account change blocks stale cart '+action,async()=>{
  let account=1;const page=await app({fetch:async url=>url==='/api/auth/me'?ok({userId:account,nickname:'account'}):null});
  page.selectItem(0);account=2;
  const before=page.calls.length;
  await page.click(action==='remove'?'remove-selected':'reload');
  assert.equal(page.calls.slice(before).filter(c=>c.url!=='/api/auth/me').length,0);
  assert.equal(page.el('workspace').hidden,true);assert.equal(page.el('items').children.length,0);
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

test('first anonymous visit shows only sign-in guidance, not expiration warnings',async()=>{
  const page=await app({fetch:async url=>url==='/api/auth/me'?bad(401,'UNAUTHORIZED'):null});
  assert.equal(page.el('signed-out').hidden,false);
  assert.equal(page.el('signed-out-title').textContent,'로그인이 필요해요');
  assert.equal(page.el('page-error').hidden,true);assert.equal(page.el('page-error').textContent,'');
  assert.equal(page.el('workspace').hidden,true);assert.equal(page.el('controls').disabled,true);
  assert.equal(page.calls.length,1);assert.equal(page.location.pathname,'/cart');
});

test('401 after successful initial identity check still reports session expiry',async()=>{
  const page=await app({fetch:async url=>url==='/api/cart-items'?bad(401,'UNAUTHORIZED'):null});
  assert.equal(page.el('page-error').hidden,false);assert.match(page.el('page-error').textContent,/만료/);
});

test('account change offers current cart without stale login link',async()=>{
  let account=1;const page=await app({fetch:async url=>url==='/api/auth/me'?ok({userId:account}):null});
  account=2;await page.event('focus');assert.equal(page.el('login').href,'/cart');assert.equal(page.el('login').textContent,'현재 계정 장바구니 열기');
});

test('select-all is blocked with a toast when the available total exceeds the order limit',async()=>{
  const page=await app({items:Array.from({length:6},(_,i)=>sampleItem({cartItemId:i+1,productId:70+i,quantity:10,subtotal:45000}))});
  page.selectAll();
  assert.equal(page.el('select-all').checked,false);
  assert.equal(page.el('global-toast').textContent,'한 번에 교환권 50개까지 선택할 수 있어요.');
  assert.equal(page.el('units').textContent,'0종 · 교환권 0개');
  assert.equal(page.el('btn-order-self').disabled,true);
});

test('quantity input, labels and item controls share the current limits',async()=>{
  const page=await app({items:Array.from({length:6},(_,i)=>sampleItem({cartItemId:i+1,quantity:10,subtotal:45000}))});
  assert.equal(page.el('quantity-policy').textContent,'최대 30종 보관 · 상품당 10개 · 한 번에 교환권 50개');
  assert.equal(page.el('items').children[0].children[1].children[2].disabled,true);
});

test('HTML loads the shared API before cart initialization and has no duplicate limit literal',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/cart.html'),'utf8');
  assert.ok(html.indexOf('/js/api.js')<html.indexOf('/js/cart.js'));
  assert.doesNotMatch(html,/max="10"|상품당 10개|교환권 50개|id="toast"/);
});
