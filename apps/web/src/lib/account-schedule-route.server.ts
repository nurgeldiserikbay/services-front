import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE,authenticateAccountWebMutation} from './account-web-session.server';
import {mutateAccountSchedule} from './account-session-bff.server';
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
export async function handleAccountSchedule(request:NextRequest,id:string,
 action:'propose'|'confirm'|'decline',proposalId?:string):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_SCHEDULE!=='enabled')return reply(404,'UNAVAILABLE');
 const auth={cookieValue:request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,
  csrfToken:request.headers.get('x-services-csrf')??undefined,
  origin:request.headers.get('origin'),fetchSite:request.headers.get('sec-fetch-site')};
 try{if(!authenticateAccountWebMutation(auth))return reply(404,'UNAVAILABLE');}
 catch{return reply(503,'UNAVAILABLE');}
 const version=request.headers.get('if-match'),key=request.headers.get('idempotency-key');
 if(!UUID.test(id)||(action!=='propose'&&(!proposalId||!UUID.test(proposalId)))||
  new URL(request.url).search||!version||!/^"[1-9][0-9]{0,9}"$/.test(version)||
  Number(version.slice(1,-1))>2147483646||!key||!KEY.test(key)||
  request.headers.has('authorization')||request.headers.has('guest-capability')||
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
   result=await mutateAccountSchedule({...common,action,body});
  }else{
   if(!proposalId||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
    return reply(400,'INVALID_REQUEST');
   result=await mutateAccountSchedule({...common,action,proposalId});
  }
  if(result.kind!=='ok')return result.kind==='conflict'?reply(409,'CONFLICT'):reply(404,'NOT_FOUND');
  return NextResponse.json(result.receipt,{status:action==='propose'?201:200,headers:HEADERS});
 }catch{return reply(503,'UNAVAILABLE');}
}
