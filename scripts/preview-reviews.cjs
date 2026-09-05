// Local-only preview. Creates its own disposable MySQL database; never uses DB_NAME from the env file.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const beRoot = process.env.REVIEW_BE_ROOT;
if (!beRoot || !process.env.REVIEW_DB_ENV_FILE) throw new Error('Set REVIEW_BE_ROOT and REVIEW_DB_ENV_FILE');
const fromBE = createRequire(path.join(beRoot, 'package.json'));
const mysql = fromBE('mysql2/promise'), express = fromBE('express'), session = fromBE('express-session');
const cfg = fromBE('dotenv').parse(fs.readFileSync(process.env.REVIEW_DB_ENV_FILE));
if (!['localhost','127.0.0.1','::1'].includes(cfg.DB_HOST)) throw new Error('Only local MySQL is allowed');
const database = 'review_preview_' + crypto.randomBytes(8).toString('hex');
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
  console.log('Local review preview closed; disposable database removed.');
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
  for(const [i,name] of ['Ethan','산책하는날','소담','익산산책','하루','선물한스푼','봄날','커피한잔'].entries())
    await connection.query('INSERT INTO users (id,email,password,nickname) VALUES (?,?,?,?)',[i+1,'sample'+i+'@example.test',password,name]);
  await connection.query("INSERT INTO categories (id,name) VALUES (1,'샘플 상품')");
  const products=[
    [76,'익산역 아메리카노 교환권','익산역 카페',4500,'/images/product_76.png',1],
    [77,'익산 빵마을 베이커리 세트 교환권','익산 빵마을',12000,'/images/product_77.png',1],
    [78,'한우 불고기 세트 교환권','익산축산협동조합',65000,'/images/product_78.png',1]
  ];
  for(const product of products)await connection.query('INSERT INTO products (id,name,brand,price,thumbnail_url,category_id) VALUES (?,?,?,?,?,?)',product);
  const addGift=async(userId,productId,used=true)=>{
    const name=['Ethan','산책하는날','소담','익산산책','하루','선물한스푼','봄날','커피한잔'][userId-1];
    const [order]=await connection.query("INSERT INTO orders (user_id,sender_nickname_snapshot,product_id,receiver_id,receiver_nickname_snapshot,total_price,is_self_gift,payment_status) VALUES (2,'산책하는날',?,?,?,4500,0,'paid')",[productId,userId,name]);
    const [gift]=await connection.query("INSERT INTO gifts (order_id,barcode,status,used_at) VALUES (?,?,?,?)",[order.insertId,'sample-'+crypto.randomBytes(8).toString('hex'),used?'used':'unused',used?new Date():null]);
    return gift.insertId;
  };
  await addGift(1,76);await addGift(1,77);await addGift(1,78,false);
  const contents=[
    '기차 기다리면서 교환했어요. 커피 향이 좋아서 잠깐 쉬어가기 좋았습니다.',
    '부담 없이 전하기 좋은 선물이었어요. 매장에서 교환하는 과정도 간단했어요.',
    '산책 후에 시원하게 한 잔 마셨어요. 다음에는 친구에게도 선물하고 싶어요.',
    '선물받아서 더 기분 좋았어요. 진한 커피를 좋아하는 분께 잘 맞을 것 같아요.',
    '커피는 좋았지만 제가 갔을 때는 대기가 조금 있었어요.',
    '익산역에 들를 때 쓰기 편했어요. 잘 사용했습니다.',
    '친구가 보내준 작은 선물 덕분에 하루를 기분 좋게 시작했어요.'
  ];
  for(let i=0;i<contents.length;i++){
    const userId=i+1,giftId=await addGift(userId,76);
    const name=['Ethan','산책하는날','소담','익산산책','하루','선물한스푼','봄날'][i];
    await connection.query('INSERT INTO reviews (product_id,gift_id,user_id,reviewer_nickname_snapshot,rating,content,created_at) VALUES (76,?,?,?,?,?,?)',[giftId,userId,name,[5,5,4,5,3,4,5][i],contents[i],new Date(Date.now()-i*86400000)]);
  }
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
    if(err)return next(err);req.session.userId=1;req.session.save(err=>err?next(err):res.json({status:'success'}));
  }));
  for(const resource of ['auth','users','orders','gifts','products','reviews','categories','brands','wishlists'])
    app.use('/api/'+resource,fromBE('./routes/'+resource));
  app.use(express.static(path.join(__dirname,'../public')));
  app.use((err,req,res,next)=>{console.error('Preview request failed:',err.code||err.name);res.status(500).json({message:'샘플 서버 오류'});});
  await new Promise((resolve,reject)=>{server=app.listen(Number(process.env.PORT||8088),'127.0.0.1',resolve);server.once('error',reject);});
  console.log('Review preview: http://127.0.0.1:'+server.address().port+'/review-sample.html');
  console.log('Disposable fixture DB: '+database+' (removed on Ctrl+C)');
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>cleanup().then(()=>process.exit(0)).catch(()=>process.exit(1)));
main().catch(async err=>{console.error('Preview startup failed:',err.code||err.message);await cleanup();process.exit(1);});
