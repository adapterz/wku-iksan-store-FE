'use strict';
const assert=require('node:assert/strict');
const origin=process.env.REVIEW_PREVIEW_URL || 'http://127.0.0.1:8088';
if(new URL(origin).hostname!=='127.0.0.1')throw new Error('Local preview only');
let cookie='', checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function api(url,method='GET',body,authenticated=true){
 const res=await fetch(origin+url,{method,headers:{...(authenticated&&cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
 return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control')};
}
(async()=>{
 check((await api('/__preview/status')).body.localPreview===true,'preview guard');
 check((await api('/api/reviews/me','GET',undefined,false)).status===401,'guest cannot read own reviews');
 check((await api('/__preview/login','POST')).status===200,'fixture login');
 const gifts=(await api('/api/gifts')).body.data;
 const unused=gifts.find(g=>g.status==='unused'), gift=gifts.find(g=>g.canReview);
 check(!!unused&&!unused.canReview,'unused gift disabled');
 check(!!gift,'writable gift fixture');
 check((await api('/api/reviews','POST',{giftId:unused.giftId,rating:5,content:'test'})).status===403,'unused rejected by server');
 check((await api('/api/reviews','POST',{giftId:gift.giftId,rating:0,content:'test'})).status===400,'invalid rating');
 check((await api('/api/reviews','POST',{giftId:gift.giftId,rating:5,content:' '.repeat(3)})).status===400,'blank review');
 check((await api('/api/reviews','POST',{giftId:gift.giftId,rating:5,content:'가'.repeat(1001)})).status===400,'length limit');
 const created=await api('/api/reviews','POST',{giftId:gift.giftId,rating:5,content:'preview smoke fixture'});
 check(created.status===201,'create review');
 const id=created.body.data.reviewId;
 try{
  check((await api('/api/reviews','POST',{giftId:gift.giftId,rating:5,content:'duplicate'})).status===409,'duplicate rejected');
  const updated=await api('/api/reviews/'+id,'PATCH',{rating:4,content:'preview edited'});
  check(updated.body.data.rating===4&&updated.body.data.content==='preview edited','edit review');
  const list=await api('/api/products/'+gift.productId+'/reviews?limit=1');
  check(list.cache==='private, no-store','no review caching');
  check(list.body.data.reviews.length===1&&list.body.meta.totalCount>=8,'pagination');
  check((await api('/api/reviews/me')).body.data.some(r=>r.reviewId===id),'own review visible');
 }finally{check((await api('/api/reviews/'+id,'DELETE')).status===200,'delete fixture review');}
 check((await api('/api/gifts/'+gift.giftId)).body.data.canReview,'can rewrite after deletion');
 check((await api('/api/auth/logout','POST')).status===200,'logout');
 check((await api('/api/reviews/me')).status===401,'session ended');
 console.log('PASS: '+checks+' local review preview API checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
