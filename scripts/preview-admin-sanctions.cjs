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
const database = 'admin_sanctions_preview_' + crypto.randomBytes(8).toString('hex');
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
  console.log('Local admin-sanctions preview closed; disposable database removed.');
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
  const ADMIN_ID=1, USER_WITH_HISTORY=2, USER_ACTIVE_SUSPENSION=3, USER_CLEAN=4;

  const future=new Date(Date.now()+7*86400000);
  const past=new Date(Date.now()-1*86400000);

  // userId 2: 경고 1건 + 조기 해제된 과거 정지 1건 — 이력 있는 유저 예시.
  await connection.query(
    "INSERT INTO user_sanctions (user_id,type,reason,issued_by,status) VALUES (?,?,?,?,'active')",
    [USER_WITH_HISTORY,'warning','과장 광고성 리뷰 작성',ADMIN_ID]);
  await connection.query(
    "INSERT INTO user_sanctions (user_id,type,reason,issued_by,ends_at,status) VALUES (?,?,?,?,?,'lifted')",
    [USER_WITH_HISTORY,'suspension','욕설 리뷰 작성',ADMIN_ID,past]);

  // userId 3: 활성 정지 1건 — 조기 해제 버튼 테스트용.
  await connection.query(
    "INSERT INTO user_sanctions (user_id,type,reason,issued_by,ends_at,status) VALUES (?,?,?,?,?,'active')",
    [USER_ACTIVE_SUSPENSION,'suspension','악성 리뷰 반복 작성',ADMIN_ID,future]);

  // userId 4: 제재 이력 없음 — 신규 부여 흐름 테스트용 (그대로 둠).
  void USER_CLEAN;

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
  app.use('/api/admin/users',fromBE('./routes/admin/users'));
  app.use('/api/admin/sanctions',fromBE('./routes/admin/sanctions'));
  app.use(express.static(path.join(__dirname,'../public')));
  app.use((err,req,res,next)=>{console.error('Preview request failed:',err.code||err.name);res.status(500).json({message:'샘플 서버 오류'});});
  await new Promise((resolve,reject)=>{server=app.listen(Number(process.env.PORT||8090),'127.0.0.1',resolve);server.once('error',reject);});
  console.log('Admin sanctions preview: http://127.0.0.1:'+server.address().port+'/admin-sanctions-sample.html');
  console.log('Disposable fixture DB: '+database+' (removed on Ctrl+C)');
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>cleanup().then(()=>process.exit(0)).catch(()=>process.exit(1)));
main().catch(async err=>{console.error('Preview startup failed:',err.code||err.message);await cleanup();process.exit(1);});
