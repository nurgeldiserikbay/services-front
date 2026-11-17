import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {sealGuestRequestAccess} from '../src/lib/guest-request-access-core.mjs';

assert.equal(process.env.CI,'true','requires isolated CI');
assert.ok(process.env.RUNNER_TEMP,'requires runner secret directory');
const requireBackend=createRequire(new URL('../../../services-back/package.json',import.meta.url));
const {Client}=requireBackend('pg');
async function secret(filename){
 const raw=(await readFile(join(process.env.RUNNER_TEMP,filename),'utf8')).trim();
 const value=Buffer.from(raw,'base64');
 assert.equal(value.length,32);
 return value;
}
const webKey=await secret('services-private-bff-guest-key');
const backendKey=await secret('services-guest-capability-hmac-key');
const base=process.env.PRIVATE_BFF_TEST_BASE_URL??'http://127.0.0.1:3001';
const keys={user:randomUUID(),person:randomUUID(),org:randomUUID(),definition:randomUUID(),
 offer:randomUUID(),contact:randomUUID(),foreignContact:randomUUID(),
 request:randomUUID(),foreignRequest:randomUUID()};
const cap=()=>randomBytes(32).toString('base64url');
const proofs={valid:cap(),expired:cap(),consumed:cap(),wrongContact:cap()};
const hash=token=>createHmac('sha256',backendKey)
 .update('guest-capability:v1\0').update('READ_CANCEL\0').update(token).digest('hex');
const cookie=token=>'__Host-services_guest_request='+
 sealGuestRequestAccess(webKey,keys.request,token,Date.now()+600000).cookie;
const db=new Client({connectionString:process.env.DATABASE_URL});
let began=false;
const get=(id,proof)=>fetch(new URL('/api/guest-requests/'+id+'/status',base),{
 headers:{'Sec-Fetch-Site':'same-origin',...(proof?{Cookie:proof}:{})},
 redirect:'manual',signal:AbortSignal.timeout(8000),
});
async function deny(id,proof,why){
 const r=await get(id,proof);
 assert.equal(r.status,404,why);
 assert.match(r.headers.get('cache-control')??'',/no-store/i);
 assert.match(r.headers.get('referrer-policy')??'',/no-referrer/i);
 assert.match(r.headers.get('x-robots-tag')??'',/noindex/i);
 assert.equal(r.headers.get('set-cookie'),null);
 assert.deepEqual(await r.json(),{code:'NOT_FOUND',message:'Guest request status unavailable'});
}
await db.connect();
try{
 // Committed rows are required because the real backend uses another SQL connection.
 await db.query('INSERT INTO users(id) VALUES($1)',[keys.user]);began=true;
 await db.query('INSERT INTO persons(id,user_id) VALUES($1,$2)',[keys.person,keys.user]);
 await db.query("INSERT INTO organizations(id,owner_person_id,slug,name,status) VALUES($1,$2,$3,'Guest E2E','ACTIVE')",
 [keys.org,keys.person,'guest-ci-'+randomUUID()]);
 await db.query("INSERT INTO service_definitions(id,code,name) VALUES($1,$2,$3)",
 [keys.definition,'guest-ci-'+randomUUID(),'Guest test service']);
 await db.query("INSERT INTO service_offers(id,definition_id,organization_id,title,status,delivery_mode,contacts) VALUES($1,$2,$3,'Guest test offer','PUBLISHED','online','{}'::jsonb)",
 [keys.offer,keys.definition,keys.org]);
 for(const id of [keys.contact,keys.foreignContact])
  await db.query("INSERT INTO guest_contacts(id,channel,encrypted_value,digest,verified_at,expires_at) VALUES($1,'email','fixture',$2,now(),now()+interval '1 day')",
   [id,'guest-ci-'+randomUUID()]);
 for(const [id,contact] of [[keys.request,keys.contact],[keys.foreignRequest,keys.foreignContact]])
  await db.query("INSERT INTO service_requests(id,offer_id,guest_contact_id,source_context,seller_organization_id,status,note) VALUES($1,$2,$3,'ORGANIZATION',$4,'PENDING','private note')",
   [id,keys.offer,contact,keys.org]);
 for(const [kind,token] of Object.entries(proofs)){
  const contact=kind==='wrongContact'?keys.foreignContact:keys.contact;
  const expires=kind==='expired'?"now()-interval '1 second'":"now()+interval '1 hour'";
  await db.query("INSERT INTO guest_capabilities(id,guest_contact_id,request_id,scope,token_hash,expires_at,created_at,consumed_at) VALUES($1,$2,$3,'READ_CANCEL',$4,"+expires+",now()-interval '2 hours',$5)",
   [randomUUID(),contact,keys.request,hash(token),kind==='consumed'?new Date():null]);
 }
 const ok=await get(keys.request,cookie(proofs.valid));
 assert.equal(ok.status,200,'valid scoped guest proof must resolve');
 assert.match(ok.headers.get('cache-control')??'',/no-store/i);
 assert.match(ok.headers.get('referrer-policy')??'',/no-referrer/i);
 assert.equal(ok.headers.get('set-cookie'),null);
 const dto=await ok.json();
 assert.deepEqual(Object.keys(dto).sort(),['created_at','id','service_offer_id','state','version']);
 assert.equal(dto.id,keys.request);
 assert.equal(dto.service_offer_id,keys.offer);
 assert.equal(dto.state,'pending');
 assert.equal(dto.version,1);
 assert.ok(!JSON.stringify(dto).includes(proofs.valid));
 assert.ok(!JSON.stringify(dto).includes('private note'));
 await deny(keys.foreignRequest,cookie(proofs.valid),'other request id');
 await deny(keys.request,cookie(proofs.expired),'expired backend proof');
 await deny(keys.request,cookie(proofs.consumed),'consumed backend proof');
 await deny(keys.request,cookie(proofs.wrongContact),'wrong contact binding');
 await deny(keys.request,undefined,'no cookie');
 await deny(keys.request,'__Host-services_guest_request='+cap(),'forged cookie');
 const old=sealGuestRequestAccess(webKey,keys.request,proofs.valid,
  Date.now()-1000,Date.now()-2000).cookie;
 await deny(keys.request,'__Host-services_guest_request='+old,'expired web cookie');
 console.log('Live scoped guest status returns safe DTO; foreign, expired, consumed and forged access denied');
}finally{
 if(began){
  await db.query('DELETE FROM guest_capabilities WHERE request_id=$1',[keys.request]).catch(()=>{});
  await db.query('DELETE FROM service_requests WHERE id=ANY($1::uuid[])',
   [[keys.request,keys.foreignRequest]]).catch(()=>{});
  await db.query('DELETE FROM guest_contacts WHERE id=ANY($1::uuid[])',
   [[keys.contact,keys.foreignContact]]).catch(()=>{});
  await db.query('DELETE FROM service_offers WHERE id=$1',[keys.offer]).catch(()=>{});
  await db.query('DELETE FROM service_definitions WHERE id=$1',[keys.definition]).catch(()=>{});
  await db.query('DELETE FROM organizations WHERE id=$1',[keys.org]).catch(()=>{});
  await db.query('DELETE FROM persons WHERE id=$1',[keys.person]).catch(()=>{});
  await db.query('DELETE FROM users WHERE id=$1',[keys.user]).catch(()=>{});
 }
 await db.end();
}
