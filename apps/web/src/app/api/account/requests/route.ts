import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE,authenticateAccountWebMutation}
 from '@/lib/account-web-session.server';
import {submitOwnCustomerRequest} from '@/lib/customer-create-bff.server';
import {parseCustomerCreateBytes,readCustomerCreateBody,MAX_REQUEST_BYTES}
 from '@/lib/customer-create-transport.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const IDEMPOTENCY=/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff','Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
const reply=(status:number,code:string)=>NextResponse.json({code},
 {status,headers:HEADERS});

/** Disabled unless both BFF session and registered-request flags are enabled.
 * Unknown upstream outcomes are never reported as successful creation.
 */
export async function POST(request:NextRequest):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_CUSTOMER_REQUEST_CREATE!=='enabled')
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
 const idempotencyKey=request.headers.get('idempotency-key');
 if(!idempotencyKey||!IDEMPOTENCY.test(idempotencyKey)||
  new URL(request.url).search||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
   request.headers.get('content-type')??'')||
  request.headers.has('content-encoding')||!request.body)
  return reply(400,'INVALID_REQUEST');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
   Number(length)>MAX_REQUEST_BYTES))
  return reply(400,'INVALID_REQUEST');
 let body;
 try{
  body=parseCustomerCreateBytes(
   await readCustomerCreateBody(request.body,request.signal));
 }catch{return reply(400,'INVALID_REQUEST');}
 try{
  const result=await submitOwnCustomerRequest({...auth,idempotencyKey,body});
  if(result.kind==='rate_limited')return reply(429,'RATE_LIMITED');
  if(result.kind==='conflict')return reply(409,'CONFLICT');
  if(result.kind==='not_found')return reply(404,'NOT_FOUND');
  return NextResponse.json({code:'CREATED',id:result.id,version:result.version},
   {status:201,headers:HEADERS});
 }catch{
  // The backend may have committed. Caller should retry with the SAME key.
  return reply(503,'UNAVAILABLE');
 }
}
