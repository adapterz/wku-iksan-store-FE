// Local-only preview. Creates its own disposable MySQL database; never uses DB_NAME from the env file.
// scripts/preview-reviews.cjs와 동일한 패턴 (prototype/review-pages).
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const beRoot = process.env.ADMIN_BE_ROOT;
if (!beRoot || !process.env.ADMIN_DB_ENV_FILE) throw new Error('Set ADMIN_BE_ROOT and ADMIN_DB_ENV_FILE');
const fromBE = createRequire(path.join(beRoot, 'package.json'));
const mysql = fromBE('mysql2/promise'), express = fromBE('express'), session = fromBE('express-session');
const cfg = fromBE('dotenv').parse(fs.readFileSync(process.env.ADMIN_DB_ENV_FILE));
if (!['localhost','127.0.0.1','::1'].includes(cfg.DB_HOST)) throw new Error('Only local MySQL is allowed');
const database = 'admin_inquiries_preview_' + crypto.randomBytes(8).toString('hex');
let connection, pool, server, created = false, closing = false, store;
async function cleanup() {
  if(closing)return;closing=true;
  if(server) await new Promise(resolve=>server.close(resolve));
  if(store) await new Promise(resolve=>store.clear(resolve));
  if(pool) await pool.end();
  if(connection) {
    if(created) await connection.query('DROP DATABASE ' + database);
    await connection.end();
  }
  console.log('Local admin-inquiries preview closed; disposable database removed.');
}
async function main() {
  connection = await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT||3306,user:cfg.DB_USER,password:cfg.DB_PASSWORD});
  await connection.query('CREATE DATABASE '+database+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');created=true;
  await connection.query('USE '+database);
  const schema=fs.readFileSync(path.join(beRoot,'db/schema.sql'),'utf8');
  for(const sql of schema.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await connection.query(sql);
  for(const key of ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD'])if(cfg[key]!==undefined)process.env[key]=cfg[key];
  process.env.DB_NAME=database;process.env.NODE_ENV='test';
  pool=fromBE('./db/pool');
  const password=await fromBE('bcrypt').hash(crypto.randomBytes(24).toString('hex'),10);

  // 관리자 1명(id 1) + 일반 유저 3명. 이슈 #90 3-1절처럼 최초 관리자는 role을 직접 admin으로 심는다.
  const names=['관리자','산책하는날','소담','하루'];
  for(const [i,name] of names.entries())
    await connection.query('INSERT INTO users (id,email,password,role,nickname) VALUES (?,?,?,?,?)',
      [i+1,'sample'+i+'@example.test',password,i===0?'admin':'user',name]);
  const ADMIN_ID=1, APPELLANT_ID=2, SUSPENDED_ID=3, REPORTER_ID=4;

  // 상품 현황(products.byBrand/hiddenCount/discontinuedCount)을 채우기 위한 카테고리 + 상품(브랜드 6개, 1개 hidden, 1개 discontinued).
  await connection.query("INSERT INTO categories (id,name) VALUES (1,'익산 특산품')");
  const products=[
    ['익산 딸기잼','익산로컬푸드',12000,'active'],
    ['한지 공예 세트','전주한지',34000,'active'],
    ['건해물 선물세트','군산해물',28000,'active'],
    ['목기 다과상','남원목기',52000,'hidden'],
    ['정읍 햅쌀 5kg','정읍쌀',19000,'active'],
    ['익산 곶감 세트','성당포구곶감',26000,'discontinued']
  ];
  for(const [name,brand,price,status] of products)
    await connection.query('INSERT INTO products (name,brand,price,category_id,status) VALUES (?,?,?,1,?)',[name,brand,price,status]);

  // 활성 정지 2건(APPELLANT_ID는 이의제기 문의와 연결, SUSPENDED_ID는 별개) + 경고 1건(제한 없음, 카운트 제외 확인용).
  const future=new Date(Date.now()+7*86400000);
  const [appellantSanction]=await connection.query(
    "INSERT INTO user_sanctions (user_id,type,reason,issued_by,ends_at,status) VALUES (?,?,?,?,?,'active')",
    [APPELLANT_ID,'suspension','악성 리뷰 반복 작성',ADMIN_ID,future]);
  await connection.query(
    "INSERT INTO user_sanctions (user_id,type,reason,issued_by,ends_at,status) VALUES (?,?,?,?,?,'active')",
    [SUSPENDED_ID,'suspension','욕설 리뷰 작성',ADMIN_ID,future]);
  await connection.query(
    "INSERT INTO user_sanctions (user_id,type,reason,issued_by) VALUES (?,?,?,?)",
    [REPORTER_ID,'warning','과장 광고성 리뷰 작성',ADMIN_ID]);

  // 신고 큐(reportCount) — reports.review_id/reporter_id는 nullable이라 review/gift/order 없이 스냅샷만으로 채운다.
  await connection.query(
    "INSERT INTO reports (reporter_id,review_content_snapshot,review_rating_snapshot,reason,status) VALUES (?,?,?,?,'pending')",
    [REPORTER_ID,'이 상품 완전 별로예요 사지 마세요 사기입니다',1,'허위·과장 신고']);
  await connection.query(
    "INSERT INTO reports (reporter_id,review_content_snapshot,review_rating_snapshot,reason,status) VALUES (?,?,?,?,'pending')",
    [REPORTER_ID,'[광고] 저희 블로그 놀러오세요 링크는 프로필에',5,'스팸/도배']);

  // 문의 큐 — 일반 대기 1건, 제재 이의제기 대기 1건(위 정지와 연결), 답변완료 1건(탭 전환 확인용).
  await connection.query(
    "INSERT INTO inquiries (user_id,category,content,status) VALUES (?,'general','배송지를 잘못 등록했는데 주문 취소가 안 됩니다.','pending')",
    [SUSPENDED_ID]);
  await connection.query(
    "INSERT INTO inquiries (user_id,category,content,status) VALUES (?,'sanction_appeal','리뷰에 욕설을 쓴 적이 없는데 정지됐습니다. 확인 부탁드립니다.','pending')",
    [APPELLANT_ID]);
  await connection.query(
    "INSERT INTO inquiries (user_id,category,content,admin_reply,status) VALUES (?,'general','찜한 상품이 갑자기 품절로 표시됩니다.','확인 결과 일시적 재고 오류였습니다. 지금은 정상 노출됩니다.','answered')",
    [REPORTER_ID]);

  console.log('Sanction appeal fixture sanctionId: '+appellantSanction.insertId);

  const app=express();app.use(express.json({limit:'32kb'}));
  app.use((req,res,next)=>{
    if(!['127.0.0.1','localhost'].includes(req.hostname))return res.sendStatus(403);
    const origin=req.get('origin');
    if(origin && origin!==req.protocol+'://'+req.get('host'))return res.sendStatus(403);
    next();
  });
  const constants=fromBE('./constants/session');
  store=new session.MemoryStore();
  app.use(session({name:constants.SESSION_COOKIE_NAME,secret:crypto.randomBytes(32).toString('hex'),resave:false,saveUninitialized:false,store,cookie:constants.getSessionCookieOptions(false)}));
  app.get('/__preview/status',(req,res)=>res.json({localPreview:true,appellantSanctionId:appellantSanction.insertId}));
  app.post('/__preview/login',(req,res,next)=>req.session.regenerate(err=>{
    if(err)return next(err);req.session.userId=ADMIN_ID;req.session.save(err=>err?next(err):res.json({status:'success'}));
  }));
  app.use('/api/admin/inquiries',fromBE('./routes/admin/inquiries'));
  app.use('/api/admin/dashboard',fromBE('./routes/admin/dashboard'));
  app.use('/api/admin/users',fromBE('./routes/admin/users')); // GET :id/sanctions — 정지 해제 검증용(테스트 스크립트 전용, 샘플 화면은 호출 안 함)
  app.use(express.static(path.join(__dirname,'../public')));
  app.use((err,req,res,next)=>{console.error('Preview request failed:',err.code||err.name);res.status(500).json({message:'샘플 서버 오류'});});
  await new Promise((resolve,reject)=>{server=app.listen(Number(process.env.PORT||8089),'127.0.0.1',resolve);server.once('error',reject);});
  console.log('Admin inquiries preview: http://127.0.0.1:'+server.address().port+'/admin-inquiries-sample.html');
  console.log('Disposable fixture DB: '+database+' (removed on Ctrl+C)');
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>cleanup().then(()=>process.exit(0)).catch(()=>process.exit(1)));
main().catch(async err=>{console.error('Preview startup failed:',err.code||err.message);await cleanup();process.exit(1);});
