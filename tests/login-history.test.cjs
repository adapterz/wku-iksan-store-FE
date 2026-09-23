const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const jsDir=path.join(__dirname,'../public/js');
const read=file=>fs.readFileSync(path.join(jsDir,file),'utf8');
const ORIGIN='http://localhost';

// referrer 기본값은 같은 사이트에서 넘어온 화면(첫 진입 아님). ''(직접 입력)이나 외부 주소를 주면 첫 진입 화면이 된다.
function apiPage({url=`${ORIGIN}/product?id=76`,fetch,referrer=`${ORIGIN}/`,state=null,historyLength=2}={}){
  const docEvents=new Map(),timers=[],replaced=[],assigned=[],toasts=[];
  const location={href:url,origin:ORIGIN,replace:target=>replaced.push(target),assign:target=>assigned.push(target)};
  const history={state,length:historyLength,replaceState:next=>{history.state=next;}};
  const toastEl={style:{},setAttribute(){},offsetWidth:0,set textContent(v){toasts.push(v);}};
  const ctx={window:{location,history},document:{referrer,addEventListener:(type,fn)=>docEvents.set(type,fn),getElementById:()=>toastEl,createElement:()=>toastEl,body:{appendChild(){}}},
    URL,fetch,setTimeout:(fn,ms)=>timers.push({fn,ms}),clearTimeout(){},console:{error(){}}};
  vm.createContext(ctx);vm.runInContext(read('api.js'),ctx);
  const click=(href,{link={},...overrides}={})=>{
    const anchor={href,target:'',hasAttribute:()=>false,...link};
    const event={defaultPrevented:false,button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,
      target:{closest:selector=>selector==='a[href]'?anchor:null},preventDefault(){this.defaultPrevented=true;},...overrides};
    docEvents.get('click')(event);return event;
  };
  return {ctx,replaced,assigned,history,timers,toasts,click};
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

test('entry that did not come from this site is marked as the first site entry, keeping existing state',()=>{
  for(const referrer of ['','https://www.google.com/search?q=iksan']){
    const p=apiPage({referrer,state:{keep:1}});
    // vm 안에서 만들어진 객체라 프로토타입이 달라 그대로 deepEqual 하면 실패한다. 호스트 객체로 복사해 비교한다.
    assert.deepEqual({...p.history.state},{keep:1,firstSiteEntry:true},JSON.stringify(referrer));
  }
  assert.deepEqual({...apiPage({referrer:''}).history.state},{firstSiteEntry:true});
});

test('entries reached from within the site are not marked',()=>{
  const p=apiPage({referrer:`${ORIGIN}/product?id=1`});
  assert.equal(p.history.state,null);
});

test('a new tab opened from a site link is marked as first entry even with a same-site referrer',()=>{
  const p=apiPage({referrer:`${ORIGIN}/product?id=1`,historyLength:1});
  assert.deepEqual({...p.history.state},{firstSiteEntry:true});
  p.click(`${ORIGIN}/login`);
  assert.deepEqual(p.assigned,[`${ORIGIN}/login`]);
  assert.deepEqual(p.replaced,[]);
});

test('first site entry is kept (push) when the user goes to login, other entries are replaced',()=>{
  const first=apiPage({referrer:''});
  first.ctx.navigateToLogin(`${ORIGIN}/`,{keepFirstEntry:true});
  assert.deepEqual(first.assigned,[`/login?redirect=${encodeURIComponent(`${ORIGIN}/`)}`]);
  assert.deepEqual(first.replaced,[]);
  const inner=apiPage();
  inner.ctx.navigateToLogin(`${ORIGIN}/`,{keepFirstEntry:true});
  assert.deepEqual(inner.assigned,[]);
  assert.equal(inner.replaced.length,1);
});

test('login anchor click on the first site entry pushes so back returns to it; elsewhere it replaces',()=>{
  const first=apiPage({referrer:''});
  assert.equal(first.click(`${ORIGIN}/login.html?redirect=x`).defaultPrevented,true);
  assert.deepEqual(first.assigned,[`${ORIGIN}/login.html?redirect=x`]);
  assert.deepEqual(first.replaced,[]);
  const inner=apiPage();
  inner.click(`${ORIGIN}/login`);
  assert.deepEqual(inner.assigned,[]);
  assert.deepEqual(inner.replaced,[`${ORIGIN}/login`]);
});

test('auth-required redirects still replace even on the first site entry',async()=>{
  const p=apiPage({referrer:'',fetch:async()=>({ok:false,status:401,json:async()=>({code:'UNAUTHORIZED'})})});
  await p.ctx.requestJson('/api/gifts');p.timers[0].fn();
  p.ctx.navigateToLogin();
  assert.deepEqual(p.assigned,[]);
  assert.equal(p.replaced.length,2);
});

test('history.replaceState in page scripts must not drop the first-entry marker',()=>{
  for(const file of fs.readdirSync(jsDir).filter(name=>name.endsWith('.js'))){
    read(file).split('\n').forEach((line,index)=>{
      assert.doesNotMatch(line,/history\.replaceState\(\s*(?:\{\}|null)\s*,/,`${file}:${index+1} overwrites history.state: ${line.trim()}`);
    });
  }
});

function loginPage(){
  const listeners=new Map(),replaced=[];
  const handlers={},signup={href:`${ORIGIN}/signup.html`,addEventListener:(type,fn)=>{handlers.signup=fn;}};
  const home={addEventListener:(type,fn)=>{handlers.home=fn;}};
  const ctx={window:{location:{search:'',origin:ORIGIN,replace:target=>replaced.push(target)}},
    document:{addEventListener:(type,fn)=>listeners.set(type,fn),getElementById:id=>id==='btn-home'?home:null,querySelector:s=>s==='.auth-footer a[href="signup.html"]'?signup:null},
    localStorage:{setItem(){}},console:{error(){}}};
  vm.createContext(ctx);vm.runInContext(read('login.js'),ctx);listeners.get('DOMContentLoaded')();
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

// 마이페이지(로그아웃 후 로그인 이동)는 의도적으로 push를 유지하는 예외다.
const PUSH_TO_LOGIN_ALLOWED=new Set(['mypage.js']);
test('no page script pushes the login page with location.href; they must use navigateToLogin',()=>{
  const pushToLogin=/(?:location\.href|location\.assign)\s*(?:=|\()\s*[`'"]\/?login/;
  for(const file of fs.readdirSync(jsDir).filter(name=>name.endsWith('.js')&&!PUSH_TO_LOGIN_ALLOWED.has(name))){
    read(file).split('\n').forEach((line,index)=>{
      assert.doesNotMatch(line,pushToLogin,`${file}:${index+1} pushes login onto history: ${line.trim()}`);
    });
  }
});
