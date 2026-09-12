// Local-only preview. Creates its own disposable MySQL database; never uses DB_NAME from the env file.
// scripts/preview-admin-inquiries.cjs와 동일한 패턴.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const beRoot = process.env.ADMIN_BE_ROOT;
if (!beRoot || !process.env.ADMIN_DB_ENV_FILE) throw new Error('Set ADMIN_BE_ROOT and ADMIN_DB_ENV_FILE');
const fromBE = createRequire(path.join(beRoot, 'package.json'));
const mysql = fromBE('mysql2/promise'), express = fromBE('express'), session = fromBE('express-session');
const cfg = fromBE('dotenv').parse(fs.readFileSync(process.env.ADMIN_DB_ENV_FILE));
if (!['localhost','127.0.0.1','::1'].includes(cfg.DB_HOST)) throw new Error('Only local MySQL is allowed');
const database = 'admin_products_preview_' + crypto.randomBytes(8).toString('hex');
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
  console.log('Local admin-products preview closed; disposable database removed.');
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

  await connection.query('INSERT INTO users (id,email,password,role,nickname) VALUES (1,?,?,\'admin\',\'관리자\')',
    ['sample-admin@example.test',password]);

  await connection.query("INSERT INTO categories (id,name) VALUES (1,'익산 특산품'),(2,'전통 공예')");

  const products=[
    ['익산 딸기잼','익산로컬푸드',12000,1,'active','2026-12-31까지','매장 방문 후 바코드 제시','익산역점','냉장 보관 필수'],
    ['한지 공예 세트','전주한지',34000,2,'active','2027-06-30까지','매장 방문 후 바코드 제시','전주 한지마을점',null],
    ['목기 다과상','남원목기',52000,2,'hidden','2027-03-31까지','매장 방문 후 바코드 제시','남원 목기공방점',null],
    ['익산 곶감 세트','성당포구곶감',26000,1,'discontinued','2026-11-30까지','매장 방문 후 바코드 제시','익산역점','실온 보관']
  ];
  for(const [name,brand,price,categoryId,status,validPeriod,usageMethod,exchangeLocation,caution] of products)
    await connection.query(
      `INSERT INTO products (name,brand,price,category_id,status,valid_period,usage_method,exchange_location,caution)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [name,brand,price,categoryId,status,validPeriod,usageMethod,exchangeLocation,caution]);

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
  app.use('/api/auth',fromBE('./routes/auth')); // checkAndLoad()가 role 확인용으로 /api/auth/me를 호출한다
  app.use('/api/admin/products',fromBE('./routes/admin/products'));
  app.use('/api/admin/categories',fromBE('./routes/admin/categories'));
  app.use('/api/categories',fromBE('./routes/categories'));
  app.use(express.static(path.join(__dirname,'../public')));
  app.use((err,req,res,next)=>{console.error('Preview request failed:',err.code||err.name);res.status(500).json({message:'샘플 서버 오류'});});
  await new Promise((resolve,reject)=>{server=app.listen(Number(process.env.PORT||8091),'127.0.0.1',resolve);server.once('error',reject);});
  console.log('Admin products preview: http://127.0.0.1:'+server.address().port+'/admin-products-sample.html');
  console.log('Disposable fixture DB: '+database+' (removed on Ctrl+C)');
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>cleanup().then(()=>process.exit(0)).catch(()=>process.exit(1)));
main().catch(async err=>{console.error('Preview startup failed:',err.code||err.message);await cleanup();process.exit(1);});
