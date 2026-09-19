const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function page(fetchCart){
  const badge={hidden:true,textContent:''},events=new Map();
  const ctx={window:{addEventListener:(type,fn)=>events.set(type,fn)},document:{body:null,addEventListener(){},getElementById:()=>null,querySelectorAll:s=>s==='.cart-count-badge'?[badge]:[]},console:{error(){}},requestJson:fetchCart};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/component.js'),'utf8'),ctx);
  return {ctx,badge,event:(type,data={})=>events.get(type)(data),update:()=>ctx.window.updateCartBadge()};
}
test('cart-updated and restored pageshow invalidate badge cache, normal pageshow does not fetch again',async()=>{
  let quantity=2,calls=0;const p=page(async()=>{calls++;return {data:[{productId:1,quantity}]};});
  await p.update();assert.equal(p.badge.textContent,'2');
  quantity=5;await p.event('cart-updated');assert.equal(p.badge.textContent,'5');
  quantity=1;await p.event('pageshow',{persisted:true});assert.equal(p.badge.textContent,'1');
  await p.event('pageshow',{persisted:false});assert.equal(calls,3);
});
test('restored anonymous page clears old badge without redirect or unhandled rejection',async()=>{
  let loggedIn=true;const p=page(async()=>{if(!loggedIn)throw {status:401};return {data:[{productId:1,quantity:2}]};});
  await p.update();loggedIn=false;await p.event('pageshow',{persisted:true});assert.equal(p.badge.hidden,true);
});
test('stale in-flight response cannot overwrite cache after invalidation',async()=>{
  let firstResolve,calls=0;const p=page(async()=>{if(++calls===1)return new Promise(resolve=>{firstResolve=resolve;});return {data:[{productId:1,quantity:5}]};});
  const old=p.update();await p.event('cart-updated');
  firstResolve({data:[{productId:1,quantity:1}]});await old;
  assert.equal(p.badge.textContent,'5');assert.equal(p.ctx.window._cartCache[0].quantity,5);
});
test('failed refresh can be retried without poisoning shared cache',async()=>{
  let fail=true;const p=page(async()=>{if(fail)throw Error('offline');return {data:[{productId:1,quantity:3}]};});
  await p.update();assert.equal(p.ctx.window._cartCache,null);fail=false;await p.update();assert.equal(p.badge.textContent,'3');
});
