const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const jsDir=path.join(__dirname,'../public/js');
const read=file=>fs.readFileSync(path.join(jsDir,file),'utf8');
const ORIGIN='http://localhost';

function apiPage({url=`${ORIGIN}/product?id=76`,fetch}={}){
  const docEvents=new Map(),timers=[],replaced=[],assigned=[],toasts=[];
  const location={href:url,origin:ORIGIN,replace:target=>replaced.push(target),assign:target=>assigned.push(target)};
  const toastEl={style:{},setAttribute(){},offsetWidth:0,set textContent(v){toasts.push(v);}};
  const ctx={window:{location},document:{addEventListener:(type,fn,capture)=>docEvents.set(type,{fn,capture}),getElementById:()=>toastEl,createElement:()=>toastEl,body:{appendChild(){}}},
    URL,fetch,setTimeout:(fn,ms)=>timers.push({fn,ms}),clearTimeout(){},console:{error(){}}};
  vm.createContext(ctx);vm.runInContext(read('api.js'),ctx);
  const click=(href,{link={},...overrides}={})=>{
    const anchor={href,target:'',hasAttribute:()=>false,...link};
    const event={defaultPrevented:false,button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,
      target:{closest:selector=>selector==='a[href]'?anchor:null},preventDefault(){this.defaultPrevented=true;},...overrides};
    docEvents.get('click').fn(event);return event;
  };
  return {ctx,replaced,assigned,timers,toasts,click,docEvents};
}

test('navigateToLogin replaces the current entry instead of pushing, encoding the return target',()=>{
  const p=apiPage();
  p.ctx.navigateToLogin();
  p.ctx.navigateToLogin(`${ORIGIN}/product?id=76&type=self`);
  assert.deepEqual(p.replaced,['/login',`/login?redirect=${encodeURIComponent(`${ORIGIN}/product?id=76&type=self`)}`]);
});

test('401 response toasts, then replaces (not pushes) with login carrying the current URL',async()=>{
  const p=apiPage({fetch:async()=>({ok:false,status:401,json:async()=>({code:'UNAUTHORIZED'})})});
  await p.ctx.requestJson('/api/wishlists');
  assert.deepEqual(p.replaced,[]);
  assert.equal(p.timers.length,1);assert.equal(p.timers[0].ms,800);
  p.timers[0].fn();
  assert.deepEqual(p.replaced,[`/login?redirect=${encodeURIComponent(`${ORIGIN}/product?id=76`)}`]);
});

test('login anchors (any spelling) are turned into replace navigations',()=>{
  for(const href of [`${ORIGIN}/login`,`${ORIGIN}/login.html`,`${ORIGIN}/login?redirect=%2Fcart`,`${ORIGIN}/login.html?redirect=cart.html`,`${ORIGIN}/login/`]){
    const p=apiPage();const event=p.click(href);
    assert.equal(event.defaultPrevented,true,href);
    assert.deepEqual(p.replaced,[href],href);
  }
});

test('non-login links, other origins, modified clicks and new-tab links pass through',()=>{
  const p=apiPage();
  for(const href of [`${ORIGIN}/mypage`,`${ORIGIN}/loginx`,`${ORIGIN}/admin/login`,`${ORIGIN}/cart?next=/login`,'https://evil.example/login']){
    assert.equal(p.click(href).defaultPrevented,false,href);
  }
  const login=`${ORIGIN}/login`;
  for(const overrides of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]){
    assert.equal(p.click(login,overrides).defaultPrevented,overrides.defaultPrevented===true,JSON.stringify(overrides));
  }
  assert.equal(p.click(login,{link:{target:'_blank'}}).defaultPrevented,false);
  assert.equal(p.click(login,{link:{hasAttribute:name=>name==='download'}}).defaultPrevented,false);
  assert.equal(p.click(login,{target:{closest:()=>null}}).defaultPrevented,false);
  assert.deepEqual(p.replaced,[]);
});

test('login anchor delegation listens in the capture phase so stopPropagation below cannot bypass it',()=>{
  assert.equal(apiPage().docEvents.get('click').capture,true);
});

test('every login navigation replaces; nothing pushes with assign',async()=>{
  const p=apiPage({fetch:async()=>({ok:false,status:401,json:async()=>({code:'UNAUTHORIZED'})})});
  p.click(`${ORIGIN}/login`);
  p.ctx.navigateToLogin(`${ORIGIN}/`);
  await p.ctx.requestJson('/api/gifts');p.timers[0].fn();
  assert.deepEqual(p.assigned,[]);
  assert.equal(p.replaced.length,3);
});

function loginPage(){
  const listeners=new Map(),replaced=[];
  const handlers={},signup={href:`${ORIGIN}/signup.html`,addEventListener:(type,fn)=>{handlers.signup=fn;}};
  const home={addEventListener:(type,fn)=>{handlers.home=fn;}};
  const ctx={window:{location:{search:'',origin:ORIGIN,replace:target=>replaced.push(target)}},
    document:{addEventListener:(type,fn)=>listeners.set(type,fn),getElementById:id=>id==='btn-home'?home:null,querySelector:s=>s==='.auth-footer a[href="signup.html"]'?signup:null},
    localStorage:{setItem(){}},console:{error(){}}};
  vm.createContext(ctx);
  // login.html은 api.js를 먼저 로드하므로 login.js가 쓰는 공통 헬퍼만 api.js에서 가져온다.
  vm.runInContext(read('api.js').match(/^function isPlainLeftClick[\s\S]*?^\}/m)[0],ctx);
  vm.runInContext(read('login.js'),ctx);listeners.get('DOMContentLoaded')();
  const fire=(name,overrides={})=>{
    const event={button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...overrides};
    handlers[name](event);return event;
  };
  return {replaced,fire};
}

test('leaving the login page (home button, signup link) replaces its history entry',()=>{
  const p=loginPage();
  assert.equal(p.fire('home').defaultPrevented,true);
  assert.equal(p.fire('signup').defaultPrevented,true);
  assert.deepEqual(p.replaced,['index.html',`${ORIGIN}/signup.html`]);
});

test('signup link keeps default behavior for new-tab clicks',()=>{
  const p=loginPage();
  for(const overrides of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}]){
    assert.equal(p.fire('signup',overrides).defaultPrevented,false,JSON.stringify(overrides));
  }
  assert.deepEqual(p.replaced,[]);
});

test('no page script pushes the login page with location.href; they must use navigateToLogin',()=>{
  const pushToLogin=/(?:location\.href|location\.assign)\s*(?:=|\()\s*[`'"]\/?login/;
  for(const file of fs.readdirSync(jsDir).filter(name=>name.endsWith('.js'))){
    read(file).split('\n').forEach((line,index)=>{
      assert.doesNotMatch(line,pushToLogin,`${file}:${index+1} pushes login onto history: ${line.trim()}`);
    });
  }
});
