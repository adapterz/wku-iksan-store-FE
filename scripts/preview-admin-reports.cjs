// Local-only preview. Creates its own disposable MySQL database; never uses DB_NAME from the env file.
// scripts/preview-admin-inquiries.cjs, preview-admin-sanctions.cjs와 동일한 패턴.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const beRoot = process.env.ADMIN_BE_ROOT;
if (!beRoot || !process.env.ADMIN_DB_ENV_FILE) throw new Error('Set ADMIN_BE_ROOT and ADMIN_DB_ENV_FILE');
const fromBE = createRequire(path.join(beRoot, 'package.json'));
const mysql = fromBE('mysql2/promise'), express = fromBE('express'), session = fromBE('express-session');
const cfg = fromBE('dotenv').parse(fs.readFileSync(process.env.ADMIN_DB_ENV_FILE));
if (!['localhost','127.0.0.1','::1'].includes(cfg.DB_HOST)) throw new Error('Only local MySQL is allowed');
const database = 'admin_reports_preview_' + crypto.randomBytes(8).toString('hex');
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
  console.log('Local admin-reports preview closed; disposable database removed.');
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

  // 관리자 1명(id 1) + 리뷰 작성자 1명 + 신고자 2명. 신고자 중 한 명(WILL_BE_DELETED_ID)은
  // 아래에서 픽스처 구성 후 실제로 DELETE해서, "신고자가 탈퇴한 뒤에도 신고 기록은
  // 남아있어야 한다"(이슈 #90 6-2절)는 시나리오를 실제 FK 동작으로 재현한다.
  const names=['관리자','소담','하루','산책하는날'];
  for(const [i,name] of names.entries())
    await connection.query('INSERT INTO users (id,email,password,role,nickname) VALUES (?,?,?,?,?)',
      [i+1,'sample'+i+'@example.test',password,i===0?'admin':'user',name]);
  const ADMIN_ID=1, REVIEWER_ID=2, REPORTER_ID=3, WILL_BE_DELETED_ID=4;

  await connection.query("INSERT INTO categories (id,name) VALUES (1,'익산 특산품')");
  const products=[
    ['익산 딸기잼','익산로컬푸드',12000],
    ['한지 공예 세트','전주한지',34000]
  ];
  for(const [name,brand,price] of products)
    await connection.query('INSERT INTO products (name,brand,price,category_id,status) VALUES (?,?,?,1,?)',[name,brand,price,'active']);

  // 신고 1건마다 리뷰 1건이 필요하고, 리뷰 1건마다 gift 1건(gift는 order 1건)이 필요하다
  // (reviews.gift_id UNIQUE NOT NULL). 신고 큐 화면은 이 order/gift 체인을 몰라도 되므로
  // 최소한으로만 채운다.
  async function makeReview({ productId, userId, rating, content, status = 'visible' }) {
    const [orderResult] = await connection.query(
      `INSERT INTO orders (user_id,sender_nickname_snapshot,product_id,receiver_id,receiver_nickname_snapshot,total_price,is_self_gift,payment_status)
       VALUES (?,'샘플 발신자',?,?,'샘플 수신자',10000,true,'paid')`,
      [userId, productId, userId]);
    const [giftResult] = await connection.query(
      "INSERT INTO gifts (order_id,barcode,status,used_at) VALUES (?,?,?,NOW())",
      [orderResult.insertId, 'SAMPLE-' + crypto.randomBytes(6).toString('hex').toUpperCase(), 'used']);
    const [reviewResult] = await connection.query(
      `INSERT INTO reviews (product_id,gift_id,user_id,reviewer_nickname_snapshot,rating,content,status)
       VALUES (?,?,?,'소담',?,?,?)`,
      [productId, giftResult.insertId, userId, rating, content, status]);
    return reviewResult.insertId;
  }

  async function makeReport({ reviewId, reporterId, reason, status = 'pending' }) {
    const [review] = await connection.query('SELECT rating, content FROM reviews WHERE id = ?', [reviewId]);
    const { rating, content } = review[0];
    const [result] = await connection.query(
      `INSERT INTO reports (review_id,reporter_id,review_content_snapshot,review_rating_snapshot,reason,status)
       VALUES (?,?,?,?,?,?)`,
      [reviewId, reporterId, content, rating, reason, status]);
    return result.insertId;
  }

  // ① 대기 중 — 평범한 신고. 관리자가 실제로 판단해야 하는 기본 케이스.
  const review1 = await makeReview({ productId: 1, userId: REVIEWER_ID, rating: 2, content: '배송은 빨랐는데 맛은 그냥 그랬어요.' });
  await makeReport({ reviewId: review1, reporterId: REPORTER_ID, reason: '경쟁 판매자가 악의적으로 낮은 별점을 준 것 같습니다.' });

  // ② 대기 중 — 저장된 텍스트를 이스케이프 없이 그대로 렌더링하면 관리자 브라우저에서
  // 스크립트가 실행되는 저장형 XSS 공격 벡터(신고 사유 + 리뷰 내용 둘 다 사용자 입력).
  // 화면에서 두 값 모두 escapeHtml을 거치는지 확인하는 용도.
  const review2 = await makeReview({
    productId: 1, userId: REVIEWER_ID, rating: 1,
    content: '<img src=x onerror="alert(document.cookie)">이 상품 절대 사지 마세요 사기입니다'
  });
  await makeReport({
    reviewId: review2, reporterId: REPORTER_ID,
    reason: "<script>alert('xss')</script>허위 과장 광고성 리뷰입니다"
  });

  // ③ 처리 완료(숨김) — 이미 조치된 신고. 리뷰도 실제로 hidden 상태로 맞춰 일관성 유지.
  const review3 = await makeReview({
    productId: 2, userId: REVIEWER_ID, rating: 1,
    content: '판매자가 욕설로 응대했습니다. 이 XX같은 판매자 신고합니다.', status: 'hidden'
  });
  await makeReport({ reviewId: review3, reporterId: REPORTER_ID, reason: '욕설 및 비속어 포함', status: 'actioned' });

  // ④ 처리 완료(기각) — 검토 결과 위반이 아니라고 판단된 케이스.
  const review4 = await makeReview({ productId: 2, userId: REVIEWER_ID, rating: 3, content: '배송이 하루 늦었어요. 그래도 상품은 괜찮았습니다.' });
  await makeReport({ reviewId: review4, reporterId: REPORTER_ID, reason: '별점이 낮다는 이유만으로 신고합니다.', status: 'dismissed' });

  // ⑤ 대기 중 — 신고 접수 이후 리뷰 작성자가 리뷰를 직접 삭제한 경우.
  // reports.review_id는 ON DELETE SET NULL이므로, 리뷰를 실제로 지워서
  // "삭제된 리뷰에 대한 신고 기록도 스냅샷으로 남아있어야 한다"(6-2절)를 그대로 재현한다.
  const review5 = await makeReview({ productId: 1, userId: REVIEWER_ID, rating: 1, content: '광고 링크가 포함된 리뷰입니다: http://example-spam.test' });
  await makeReport({ reviewId: review5, reporterId: REPORTER_ID, reason: '스팸/광고성 리뷰' });
  await connection.query('DELETE FROM reviews WHERE id = ?', [review5]);

  // ⑥ 대기 중 — 신고자가 이후 탈퇴한 경우. reports.reporter_id도 ON DELETE SET NULL이라
  // 탈퇴해도 신고 기록 자체는 남는다.
  const review6 = await makeReview({ productId: 2, userId: REVIEWER_ID, rating: 2, content: '설명과 실제 상품이 많이 달라요.' });
  await makeReport({ reviewId: review6, reporterId: WILL_BE_DELETED_ID, reason: '허위 상품 설명 관련 신고' });
  await connection.query('DELETE FROM users WHERE id = ?', [WILL_BE_DELETED_ID]);

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
  app.get('/__preview/status',(req,res)=>res.json({localPreview:true}));
  app.post('/__preview/login',(req,res,next)=>req.session.regenerate(err=>{
    if(err)return next(err);req.session.userId=ADMIN_ID;req.session.save(err=>err?next(err):res.json({status:'success'}));
  }));
  // 테스트 스크립트 전용: 관리자 아닌 로그인 사용자로도 403 FORBIDDEN_NOT_ADMIN 경계를
  // 실제로 검증하기 위한 로그인 경로. 샘플 화면(admin-reports-sample.js)은 호출하지 않는다.
  app.post('/__preview/login-as-user',(req,res,next)=>req.session.regenerate(err=>{
    if(err)return next(err);req.session.userId=REVIEWER_ID;req.session.save(err=>err?next(err):res.json({status:'success'}));
  }));
  app.use('/api/auth',fromBE('./routes/auth')); // checkAndLoad()가 role 확인용으로 /api/auth/me를 호출한다
  app.use('/api/admin/reports',fromBE('./routes/admin/reports'));
  app.use(express.static(path.join(__dirname,'../public')));
  app.use((err,req,res,next)=>{console.error('Preview request failed:',err.code||err.name);res.status(500).json({message:'샘플 서버 오류'});});
  await new Promise((resolve,reject)=>{server=app.listen(Number(process.env.PORT||8092),'127.0.0.1',resolve);server.once('error',reject);});
  console.log('Admin reports preview: http://127.0.0.1:'+server.address().port+'/admin-reports-sample.html');
  console.log('Disposable fixture DB: '+database+' (removed on Ctrl+C)');
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>cleanup().then(()=>process.exit(0)).catch(()=>process.exit(1)));
main().catch(async err=>{console.error('Preview startup failed:',err.code||err.message);await cleanup();process.exit(1);});
