import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealAccountWebSession} from '../src/lib/account-web-session-core.mjs';

// CI-only real HTTP and PostgreSQL boundary test: verifies a legitimately
// sealed *test fixture* web cookie reaches backend bearer authorization.
// Does NOT simulate verified account OTP/login or grant production access.
assert.equal(process.env.CI,'true','do not run fixture creation outside CI');
const requireBackend=createRequire(new URL('../../../services-back/package.json',import.meta.url));
const {Client}=requireBackend('pg');
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const keyPath=join(process.env.RUNNER_TEMP??'', 'services-private-bff-account-key');
assert.ok(process.env.RUNNER_TEMP,'requires isolated GitHub runner');
const key=Buffer.from((await readFile(keyPath,'utf8')).trim(),'base64');
assert.equal(key.length,32);
const hmacKey=Buffer.from(process.env.ACCOUNT_SESSION_HMAC_KEY??'','base64');
assert.equal(hmacKey.length,32);
const bearer=randomBytes(32).toString('base64url');
const tokenHash=createHmac('sha256',hmacKey)
 .update('services-session:v1\\0'.replace('\\0','\0')).update(bearer).digest('hex');
const userId=randomUUID(),sessionId=randomUUID(),familyId=randomUUID();
const sealed=sealAccountWebSession(key,bearer,600);
const cookie='__Host-services_account_web='+sealed.cookie;
const db=new Client({connectionString:process.env.DATABASE_URL});
await db.connect();
let userCreated=false;
async function inbox(){
 return fetch(new URL('/api/seller/requests?limit=20',base),{
  headers:{'Sec-Fetch-Site':'same-origin',Cookie:cookie},
  signal:AbortSignal.timeout(8000),redirect:'manual',
 });
}
try{
 await db.query('INSERT INTO users(id) VALUES($1)',[userId]);
 userCreated=true;
 await db.query(`INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at)
   VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
  [sessionId,userId,tokenHash,familyId]);
 const good=await inbox();
 assert.equal(good.status,200,'active backend bearer must reach seller inbox');
 assert.match(good.headers.get('cache-control')??'',/no-store/i);
 assert.match(good.headers.get('x-robots-tag')??'',/noindex/i);
 assert.match(good.headers.get('referrer-policy')??'',/no-referrer/i);
 assert.equal(good.headers.get('set-cookie'),null);
 const body=await good.json();
 assert.deepEqual(body.items,[],'new account has no seller membership');
 assert.equal(body.next_cursor,null);
 assert.match(body.csrf_token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(body.csrf_token,sealed.csrf);
 assert.ok(!JSON.stringify(body).includes(bearer));
 assert.ok(!JSON.stringify(body).includes(sealed.cookie));

 await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[sessionId]);
 const revoked=await inbox();
 assert.equal(revoked.status,401,'revocation must defeat still-valid web cookie');
 const denied=await revoked.json();
 assert.equal(denied.code,'AUTH_REQUIRED');
 assert.ok(!JSON.stringify(denied).includes(bearer));
 assert.equal(revoked.headers.get('set-cookie'),null);
 console.log('Signed web cookie -> actual backend empty seller inbox -> revoked bearer denied');
}finally{
 if(userCreated){
  await db.query('DELETE FROM sessions WHERE id=$1',[sessionId]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=$1',[userId]).catch(()=>{});
 }
 await db.end();
}
