import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import {GUEST_REQUEST_COOKIE} from './guest-request-access.server';
import {SCHEDULE_PROOF_COOKIE,getGuestActiveSchedule,mutateGuestSchedule} from './guest-schedule-bff.server';
import type {ScheduleProposalBody} from './account-session-transport.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff','Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
const reply=(status:number,code:string)=>NextResponse.json({code},{status,headers:HEADERS});

async function readBody(request:NextRequest,limit:number):Promise<unknown>{
 const length=request.headers.get('content-length');
 if(!request.body||(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||Number(length)>limit)))
  throw new Error('invalid body');
 const reader=request.body.getReader();
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let bytes=0,raw='',done=false;
 try{
  for(;;){
   const chunk=await reader.read();
   if(chunk.done){done=true;break;}
   bytes+=chunk.value.byteLength;
   if(bytes>limit)throw new Error('invalid body');
   raw+=decoder.decode(chunk.value,{stream:true});
  }
  raw+=decoder.decode();
  return JSON.parse(raw);
 }finally{
  if(!done)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
function isProposal(value:unknown):value is ScheduleProposalBody{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 return Object.keys(row).sort().join(',')==='end_at,local_start_at,start_at,timezone,utc_offset_seconds'&&
  typeof row.start_at==='string'&&typeof row.end_at==='string'&&
  typeof row.local_start_at==='string'&&typeof row.timezone==='string'&&
  typeof row.utc_offset_seconds==='number'&&Number.isSafeInteger(row.utc_offset_seconds);
}
export async function handleGuestSchedule(request:NextRequest,id:string,
 action:'propose'|'confirm'|'decline',proposalId?:string):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_GUEST_SCHEDULE_BFF!=='enabled')return reply(404,'UNAVAILABLE');
 const auth={cookieValue:request.cookies.get(GUEST_REQUEST_COOKIE)?.value,
  scheduleCookieValue:request.cookies.get(SCHEDULE_PROOF_COOKIE)?.value,
  csrfToken:request.headers.get('x-services-csrf')??undefined,
  origin:request.headers.get('origin'),fetchSite:request.headers.get('sec-fetch-site')};
 const version=request.headers.get('if-match'),key=request.headers.get('idempotency-key');
 if(!UUID.test(id)||(action!=='propose'&&(!proposalId||!UUID.test(proposalId)))||
  new URL(request.url).search||!version||!/^"[1-9][0-9]{0,9}"$/.test(version)||
  Number(version.slice(1,-1))>2147483646||!key||!KEY.test(key)||
  request.headers.has('authorization')||request.headers.has('guest-capability')||request.headers.has('guest-completion-capability')||
  request.headers.has('content-encoding')||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))
  return reply(400,'INVALID_REQUEST');
 let body:unknown;
 try{body=await readBody(request,action==='propose'?1024:2);}
 catch{return reply(400,'INVALID_REQUEST');}
 const common={...auth,requestId:id,version:Number(version.slice(1,-1)),key};
 try{
  let result;
  if(action==='propose'){
   if(!isProposal(body))return reply(400,'INVALID_REQUEST');
   result=await mutateGuestSchedule({...common,action,body});
  }else{
   if(!proposalId||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
    return reply(400,'INVALID_REQUEST');
   result=await mutateGuestSchedule({...common,action,proposalId});
  }
  if(result.kind!=='ok')return result.kind==='conflict'?reply(409,'CONFLICT'):reply(404,'NOT_FOUND');
  return NextResponse.json(result.receipt,{status:action==='propose'?201:200,headers:HEADERS});
 }catch{return reply(503,'UNAVAILABLE');}
}

/** POST read avoids accepting a browser-supplied capability or relaxing CSRF. */
export async function handleGuestScheduleRead(request:NextRequest,id:string):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_GUEST_SCHEDULE_BFF!=='enabled')return reply(404,'UNAVAILABLE');
 if(!UUID.test(id)||new URL(request.url).search||request.headers.has('authorization')||
  request.headers.has('guest-capability')||request.headers.has('guest-completion-capability')||
  request.headers.has('content-encoding')||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))
  return reply(400,'INVALID_REQUEST');
 try{
  const body=await readBody(request,2);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
   return reply(400,'INVALID_REQUEST');
 }catch{return reply(400,'INVALID_REQUEST');}
 try{
  const view=await getGuestActiveSchedule({requestId:id,
   cookieValue:request.cookies.get(GUEST_REQUEST_COOKIE)?.value,
   scheduleCookieValue:request.cookies.get(SCHEDULE_PROOF_COOKIE)?.value,
   csrfToken:request.headers.get('x-services-csrf')??undefined,
   origin:request.headers.get('origin'),fetchSite:request.headers.get('sec-fetch-site')});
  return NextResponse.json(view,{status:200,headers:HEADERS});
 }catch{return reply(503,'UNAVAILABLE');}
}
