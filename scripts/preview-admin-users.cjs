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
const database = 'admin_users_preview_' + crypto.randomBytes(8).toString('hex');
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
  console.log('Local admin-users preview closed; disposable database removed.');
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

  // 관리자 2명(본인 + 다른 관리자) + 일반 유저 1명.
  // OTHER_ADMIN_ID를 따로 둔 이유: 자기 자신 강등 방지(CANNOT_DEMOTE_SELF, 이슈 #90 3-3절)는
  // "본인"에게만 적용되고 "다른 관리자를 강등하는 것"은 정상 동작이어야 하는데, 관리자가
  // 1명뿐이면 이 구분을 재현할 방법이 없다.
  const names=['관리자','다른관리자','일반유저'];
  const roles=['admin','admin','user'];
  for(const [i,name] of names.entries())
    await connection.query('INSERT INTO users (id,email,password,role,nickname) VALUES (?,?,?,?,?)',
      [i+1,'sample'+i+'@example.test',password,roles[i],name]);
  const ADMIN_ID=1, OTHER_ADMIN_ID=2, PLAIN_USER_ID=3;

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
  // 실제로 검증하기 위한 로그인 경로. 샘플 화면(admin-users-sample.js)은 호출하지 않는다.
  app.post('/__preview/login-as-user',(req,res,next)=>req.session.regenerate(err=>{
    if(err)return next(err);req.session.userId=PLAIN_USER_ID;req.session.save(err=>err?next(err):res.json({status:'success'}));
  }));
  app.use('/api/auth',fromBE('./routes/auth')); // checkAndLoad()가 role 확인용으로 /api/auth/me를 호출한다
  app.use('/api/admin/users',fromBE('./routes/admin/users'));
  app.use(express.static(path.join(__dirname,'../public')));
  app.use((err,req,res,next)=>{console.error('Preview request failed:',err.code||err.name);res.status(500).json({message:'샘플 서버 오류'});});
  await new Promise((resolve,reject)=>{server=app.listen(Number(process.env.PORT||8093),'127.0.0.1',resolve);server.once('error',reject);});
  console.log('Admin users preview: http://127.0.0.1:'+server.address().port+'/admin-users-sample.html');
  console.log('Disposable fixture DB: '+database+' (removed on Ctrl+C)');
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>cleanup().then(()=>process.exit(0)).catch(()=>process.exit(1)));
main().catch(async err=>{console.error('Preview startup failed:',err.code||err.message);await cleanup();process.exit(1);});
