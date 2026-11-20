import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE,authenticateAccountWebMutation}
 from '@/lib/account-web-session.server';
import {completeOwnAccountRequest} from '@/lib/account-session-bff.server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff','Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
const reply=(status:number,code:string)=>NextResponse.json({code},
 {status,headers:HEADERS});

/**
 * This route is independently disabled until the account login/cookie
 * issuance flow, trusted backend ingress and staging CSRF review are ready.
 * No Authorization header or browser-selected customer ID is forwarded.
 */
export async function POST(
 request:NextRequest,context:{params:Promise<{id:string}>},
):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_CUSTOMER_COMPLETION!=='enabled')
  return reply(404,'UNAVAILABLE');
 const auth={
  cookieValue:request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,
  csrfToken:request.headers.get('x-services-csrf')??undefined,
  origin:request.headers.get('origin'),
  fetchSite:request.headers.get('sec-fetch-site'),
 };
 try{
  if(!authenticateAccountWebMutation(auth))return reply(404,'UNAVAILABLE');
 }catch{return reply(503,'UNAVAILABLE');}
 const {id}=await context.params;
 const version=request.headers.get('if-match');
 if(!UUID.test(id)||new URL(request.url).search||
    !version||!/^"[1-9][0-9]{0,9}"$/.test(version)||
    Number(version.slice(1,-1))>2147483646||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
     request.headers.get('content-type')??'')||
    request.headers.has('content-encoding')||
    !request.body)return reply(400,'INVALID_REQUEST');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
    Number(length)>2))return reply(400,'INVALID_REQUEST');
 const reader=request.body.getReader();
 let body='';
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array)||body.length+value.byteLength>2){
    await reader.cancel();
    return reply(400,'INVALID_REQUEST');
   }
   body+=new TextDecoder('utf-8',{fatal:true}).decode(value);
  }
 }catch{return reply(400,'INVALID_REQUEST');}
 finally{reader.releaseLock();}
 if(body!=='{}')return reply(400,'INVALID_REQUEST');
 try{
  const result=await completeOwnAccountRequest({...auth,requestId:id,
   version:Number(version.slice(1,-1))});
  if(result.kind==='conflict')return reply(409,'CONFLICT');
  if(result.kind==='not_found')return reply(404,'NOT_FOUND');
  return NextResponse.json({code:'COMPLETED',id:result.id,version:result.version},
   {status:200,headers:HEADERS});
 }catch{
  // Unknown upstream commit outcome: do not claim completion.
  return reply(503,'UNAVAILABLE');
 }
}
