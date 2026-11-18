import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE,authenticateAccountWebMutation} from '@/lib/account-web-session.server';
import {submitOwnProfessionalProfileAppeal} from '@/lib/account-session-bff.server';
export const runtime='nodejs';export const dynamic='force-dynamic';export const revalidate=0;
const headers={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Vary':'Cookie, Origin, Sec-Fetch-Site'};
const reply=(status:number,code:string)=>NextResponse.json({code},{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
  process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILES!=='enabled'||
  process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_APPEALS!=='enabled')
  return reply(404,'UNAVAILABLE');
 const auth={cookieValue:request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,
  csrfToken:request.headers.get('x-services-csrf')??undefined,
  origin:request.headers.get('origin'),fetchSite:request.headers.get('sec-fetch-site')};
 try{if(!authenticateAccountWebMutation(auth))return reply(404,'UNAVAILABLE');}
 catch{return reply(503,'UNAVAILABLE');}
 const {id}=await context.params,match=request.headers.get('if-match');
 if(!uuid.test(id)||!match||!/^"[1-9][0-9]{0,9}"$/.test(match)||
  Number(match.slice(1,-1))>2147483646||new URL(request.url).search||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')||
  request.headers.has('content-encoding')||!request.body)return reply(400,'INVALID_REQUEST');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>128))return reply(400,'INVALID_REQUEST');
 let body='',bytes=0;const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 try{
  while(true){const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;if(bytes>128){await reader.cancel();return reply(400,'INVALID_REQUEST');}
   body+=decoder.decode(value,{stream:true});
  }
  body+=decoder.decode();
 }catch{return reply(400,'INVALID_REQUEST');}finally{reader.releaseLock();}
 let parsed:unknown;
 try{parsed=JSON.parse(body);}catch{return reply(400,'INVALID_REQUEST');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
  Object.keys(parsed).length!==1||!Object.hasOwn(parsed,'decision_id')||
  typeof (parsed as {decision_id:unknown}).decision_id!=='string'||
  !uuid.test((parsed as {decision_id:string}).decision_id))
  return reply(400,'INVALID_REQUEST');
 try{
  const result=await submitOwnProfessionalProfileAppeal({...auth,id:id.toLowerCase(),
   version:Number(match.slice(1,-1)),decisionId:(parsed as {decision_id:string}).decision_id.toLowerCase()});
  return result==='submitted'?reply(201,'SUBMITTED'):reply(409,'CONFLICT');
 }catch{return reply(503,'UNAVAILABLE');}
}
