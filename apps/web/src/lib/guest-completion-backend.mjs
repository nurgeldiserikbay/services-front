const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const PROOF=/^v1\.[0-9a-f]{64}\.[0-9]{10,13}\.[0-9a-f]{64}$/;
const LIMIT=2048;
export class GuestCompletionTransportUnavailable extends Error{
 constructor(){super('Guest completion unavailable');}
}
const fail=()=>{throw new GuestCompletionTransportUnavailable();};
function endpoint(base,production,requestId,suffix){
 if(typeof base!=='string'||base.length>500||
  typeof requestId!=='string'||!UUID.test(requestId))fail();
 try{
  const url=new URL(base);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(local&&!production&&url.protocol==='http:'))||
   url.username||url.password||url.search||url.hash||
   !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?\/?$/.test(url.pathname)||
   base.includes('\\')||base.includes('%'))fail();
  url.pathname=url.pathname.replace(/\/$/,'')+
   '/guest-requests/'+requestId.toLowerCase()+'/completion'+suffix;
  return url.toString();
 }catch{fail();}
}
async function readJson(response){
 if(!response.body)fail();
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(declared)||
  Number(declared)>LIMIT))fail();
 if(response.headers.has('content-range')||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
   response.headers.get('content-type')??'')||
  !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(
   response.headers.get('cache-control')??'')||
  /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(
   response.headers.get('cache-control')??''))fail();
 const reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});
 let size=0,plain='',ended=false;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done){ended=true;break;}
   if(!(value instanceof Uint8Array)||size+value.byteLength>LIMIT)fail();
   size+=value.byteLength;
   plain+=decoder.decode(value,{stream:true});
  }
  plain+=decoder.decode();
  return JSON.parse(plain);
 }finally{
  if(!ended)try{void reader.cancel().catch(()=>{});}catch{}
  reader.releaseLock();
 }
}
async function post({url,body,headers,transport,status}){
 try{
  const response=await transport(url,{
   method:'POST',redirect:'manual',cache:'no-store',credentials:'omit',
   headers:{'Content-Type':'application/json',Accept:'application/json',...headers},
   body:JSON.stringify(body),signal:AbortSignal.timeout(5000),
  });
  if(response.status!==status){
   if(response.body)try{void response.body.cancel().catch(()=>{});}catch{}
   fail();
  }
  return await readJson(response);
 }catch{fail();}
}
function keys(v,expected){
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===expected;
}
const validExpiry=(v,now,limit)=>{
 if(typeof v!=='string'||!/^(?:\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))return false;
 const ms=Date.parse(v);
 return Number.isFinite(ms)&&new Date(ms).toISOString()===v&&
  ms>now+1000&&ms<=now+limit+5000;
};
export async function requestGuestCompletionOtp({
 baseUrl,production=true,requestId,readCapability,networkProof,locale,transport=fetch,
}){
 if(typeof readCapability!=='string'||!TOKEN.test(readCapability)||
  typeof networkProof!=='string'||!PROOF.test(networkProof)||
  !['kk','ru'].includes(locale))fail();
 const data=await post({url:endpoint(baseUrl,production,requestId,'/challenges'),
  body:{locale},headers:{'Guest-Capability':readCapability,
   'X-Services-Network-Proof':networkProof},transport,status:202});
 if(!keys(data,'challenge_id')||typeof data.challenge_id!=='string'||
  !UUID.test(data.challenge_id))fail();
 return {challengeId:data.challenge_id.toLowerCase()};
}
export async function verifyGuestCompletionOtp({
 baseUrl,production=true,requestId,challengeId,code,transport=fetch,now=Date.now(),
}){
 if(typeof challengeId!=='string'||!UUID.test(challengeId)||
  typeof code!=='string'||!/^[0-9]{6}$/.test(code)||!Number.isSafeInteger(now))fail();
 const data=await post({url:endpoint(baseUrl,production,requestId,
  '/challenges/'+challengeId.toLowerCase()+'/verify'),body:{code},
  headers:{},transport,status:200});
 if(!keys(data,'expires_at,guest_capability')||
  typeof data.guest_capability!=='string'||!TOKEN.test(data.guest_capability)||
  !validExpiry(data.expires_at,now,900000))fail();
 return {capability:data.guest_capability,expiresAt:Date.parse(data.expires_at)};
}
export async function confirmGuestCompletionBackend({
 baseUrl,production=true,requestId,completionCapability,version,transport=fetch,
}){
 if(typeof completionCapability!=='string'||!TOKEN.test(completionCapability)||
  !Number.isSafeInteger(version)||version<1||version>2147483646)fail();
 const data=await post({url:endpoint(baseUrl,production,requestId,'/confirm'),
  body:{},headers:{'Guest-Completion-Capability':completionCapability,
   'If-Match':'"'+version+'"'},transport,status:200});
 if(!keys(data,'id,state,version')||
  typeof data.id!=='string'||data.id!==requestId.toLowerCase()||
  data.state!=='completed'||data.version!==version+1)fail();
 return {id:data.id,state:'completed',version:data.version};
}
