import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealAccountWebSession} from '../src/lib/account-web-session-core.mjs';

// Real account BFF -> pinned Nest API -> PostgreSQL moderation/publication ->
// public Next.js search. Only sealed CI fixture sessions; NOT OTP production login.
assert.equal(process.env.CI,'true','never create fixture accounts outside CI');
assert.ok(process.env.RUNNER_TEMP,'isolated runner is required');
const requireBackend=createRequire(new URL('../../../services-back/package.json',import.meta.url));
const {Client}=requireBackend('pg');
const db=new Client({connectionString:process.env.DATABASE_URL});
const webBase=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const publicBase=process.env.PUBLIC_WEB_TEST_BASE_URL??'http://127.0.0.1:3000';
const apiBase=process.env.SERVICES_API_BASE_URL;
assert.ok(apiBase?.startsWith('https://'),'pinned CI backend must use trusted HTTPS');
const sealKey=Buffer.from((await readFile(join(process.env.RUNNER_TEMP,'services-private-bff-account-key'),'utf8')).trim(),'base64');
assert.equal(sealKey.length,32);
const hmac=Buffer.from(process.env.ACCOUNT_SESSION_HMAC_KEY??'','base64');
assert.equal(hmac.length,32);
const bearer=randomBytes(32).toString('base64url');
const tokenHash=createHmac('sha256',hmac)
 .update('services-session:v1\0').update(bearer).digest('hex');
const owner=randomUUID(),person=randomUUID(),session=randomUUID();
const reviewer=randomUUID(),staff=randomUUID();
const key=randomUUID(),serviceOffer=randomUUID(),moderationCase=randomUUID(),approval=randomUUID();
const profession='10000000-0000-4000-8000-000000000003';
const service='10000000-0000-4000-8000-000000000004';
const title='CI Live Profile '+randomUUID().slice(0,8);
const offerTitle=title+' service';
const sealed=sealAccountWebSession(sealKey,bearer,600);
const ownerCookie='__Host-services_account_web='+sealed.cookie;
let connected=false,created=false,profileId=null,slug=null;
const request=async(path,init={})=>fetch(new URL(path,webBase),{
 redirect:'manual',signal:AbortSignal.timeout(10000),...init,
 headers:{Cookie:ownerCookie,'Sec-Fetch-Site':'same-origin',
  Origin:'https://services.example.test',...init.headers},
});
const mutation=async(path,method,body,extra={})=>request(path,{
 method,headers:{'Content-Type':'application/json','x-services-csrf':sealed.csrf,...extra},
 body:JSON.stringify(body),
});
const backend=async(path)=>fetch(new URL(apiBase.replace(/\/$/,'')+path),{
 headers:{Authorization:'Bearer '+bearer},redirect:'manual',signal:AbortSignal.timeout(10000),
});
async function success(response,status,code){
 assert.equal(response.status,status,'expected '+code+' from BFF');
 assert.match(response.headers.get('cache-control')??'',/(?:^|,)\s*no-store(?:,|$)/);
 assert.deepEqual(await response.json(),{code});
}
try{
 await db.connect();connected=true;
 await db.query('INSERT INTO users(id) VALUES($1),($2)',[owner,reviewer]);created=true;
 await db.query('INSERT INTO persons(id,user_id,display_name) VALUES($1,$2,$3)',[person,owner,'CI profile owner']);
 await db.query("INSERT INTO platform_admin_staff(id,user_id,role) VALUES($1,$2,'admin')",[staff,reviewer]);
 await db.query("INSERT INTO sessions(id,user_id,token_hash,family_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes')",
  [session,owner,tokenHash,randomUUID()]);

 const before=await backend('/me/professional-profiles');
 assert.equal(before.status,200);
 assert.deepEqual(await before.json(),[]);
 const create=await mutation('/api/account/profiles','POST',{profession_id:profession},
  {'Idempotency-Key':key});
 await success(create,201,'CREATED');
 const afterCreate=await backend('/me/professional-profiles');
 assert.equal(afterCreate.status,200);
 const drafts=await afterCreate.json();
 assert.equal(drafts.length,1);
 const draft=drafts[0];
 profileId=draft.id;slug=draft.slug;
 assert.equal(draft.profession_id,profession);
 assert.equal(draft.lifecycle_status,'draft');
 assert.equal(draft.version,1);
 assert.equal(draft.title,null);
 assert.ok(/^pro-[0-9a-f-]{36}$/.test(slug));
 const hidden=await fetch(new URL('/professionals/'+slug,apiBase),{
  redirect:'manual',signal:AbortSignal.timeout(10000),
 });
 assert.equal(hidden.status,404,'new draft must not leak into public catalog');

 const edit=await mutation('/api/account/profiles/'+profileId,'PATCH',{
  title,about:'Verified service specialist, published through a moderated real CI flow.',
 },{'If-Match':'"1"'});
 await success(edit,200,'UPDATED');
 const stale=await mutation('/api/account/profiles/'+profileId,'PATCH',
  {title:'stale overwrite'},{'If-Match':'"1"'});
 assert.equal(stale.status,409,'optimistic locking must reject stale edit');
 const updated=await backend('/me/professional-profiles');
 const [own]=await updated.json();
 assert.equal(own.version,2);
 assert.equal(own.title,title);
 assert.equal(own.lifecycle_status,'draft');

 await db.query(
  "INSERT INTO service_offers(id,definition_id,professional_id,title,status,delivery_mode,contacts) VALUES($1,$2,$3,$4,'PUBLISHED','online','{}'::jsonb)",
  [serviceOffer,service,profileId,offerTitle]);
 const publicationPath='/api/account/profiles/'+profileId+'/publish';
 const unapproved=await mutation(publicationPath,'POST',{}, {'If-Match':'"2"'});
 assert.equal(unapproved.status,409,'public release requires exact moderation approval');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM professional_published_revisions WHERE profile_id=$1',[profileId])).rows[0].n,0);
 await db.query("INSERT INTO platform_moderation_cases(id,resource_scope,subject_kind,state) VALUES($1,$2,'professional','closed')",
  [moderationCase,'professional:'+profileId]);
 await db.query(
  "INSERT INTO professional_moderation_decisions(id,case_id,profile_id,profile_version,actor_staff_id,decision) VALUES($1,$2,$3,2,$4,'APPROVE')",
  [approval,moderationCase,profileId,staff]);
 await success(await mutation(publicationPath,'POST',{}, {'If-Match':'"2"'}),201,'PUBLISHED');
 assert.equal((await mutation(publicationPath,'POST',{}, {'If-Match':'"2"'})).status,409,
  'replaying stale publication must not create another revision');
 const record=(await db.query('SELECT status,version,published_version FROM professional_profiles WHERE id=$1',[profileId])).rows[0];
 assert.deepEqual(record,{status:'PUBLISHED',version:3,published_version:3});
 assert.equal((await db.query('SELECT count(*)::int AS n FROM professional_published_revisions WHERE profile_id=$1',[profileId])).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM professional_publication_audit WHERE profile_id=$1',[profileId])).rows[0].n,1);

 for(const locale of ['kk','ru']){
  const detail=await fetch(new URL('/'+locale+'/professionals/'+slug,publicBase),{
   signal:AbortSignal.timeout(10000),
  });
  assert.equal(detail.status,200);
  const html=await detail.text();
  assert.ok(html.includes(title),'published title must be public in '+locale);
  assert.ok(html.includes(offerTitle),'published offer must be public in '+locale);
  assert.ok(!html.includes(bearer));
  const search=new URL('/'+locale,publicBase);
  search.searchParams.set('q',title);
  const result=await fetch(search,{signal:AbortSignal.timeout(10000)});
  assert.equal(result.status,200);
  const searchHtml=await result.text();
  assert.ok(searchHtml.includes('/'+locale+'/professionals/'+slug),
   'search must discover newly published profile in '+locale);
  assert.ok(searchHtml.includes(title));
 }
 console.log('[profile-lifecycle] BFF create -> edit -> moderation -> publish -> kk/ru public search PASS');
}finally{
 if(connected){
  if(created){
   if(profileId){
    await db.query('DELETE FROM professional_publication_audit WHERE profile_id=$1',[profileId]).catch(()=>{});
    await db.query('DELETE FROM professional_published_revisions WHERE profile_id=$1',[profileId]).catch(()=>{});
    await db.query('DELETE FROM professional_moderation_decisions WHERE profile_id=$1',[profileId]).catch(()=>{});
    await db.query('DELETE FROM platform_moderation_cases WHERE id=$1',[moderationCase]).catch(()=>{});
    await db.query('DELETE FROM service_offers WHERE id=$1',[serviceOffer]).catch(()=>{});
    await db.query('DELETE FROM professional_profiles WHERE id=$1',[profileId]).catch(()=>{});
   }
   await db.query('DELETE FROM idempotency_records WHERE actor_scope=$1',['person:'+person]).catch(()=>{});
   await db.query('DELETE FROM platform_admin_staff WHERE id=$1',[staff]).catch(()=>{});
   await db.query('DELETE FROM sessions WHERE id=$1',[session]).catch(()=>{});
   await db.query('DELETE FROM persons WHERE id=$1',[person]).catch(()=>{});
   await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[owner,reviewer]]).catch(()=>{});
  }
  await db.end();
 }
}
