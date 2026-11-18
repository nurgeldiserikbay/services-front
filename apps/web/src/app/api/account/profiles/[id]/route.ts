import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE,authenticateAccountWebMutation} from '@/lib/account-web-session.server';
import {updateOwnProfessionalProfile} from '@/lib/account-session-bff.server';
import {validProfessionalEdit} from '@/lib/account-session-transport.mjs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Vary':'Cookie, Origin, Sec-Fetch-Site'};
const reply=(status:number,code:string)=>NextResponse.json({code},{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMIT=24576;
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILES!=='enabled'||process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_EDITING!=='enabled')return reply(404,'UNAVAILABLE');
 const auth={cookieValue:request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,csrfToken:request.headers.get('x-services-csrf')??undefined,origin:request.headers.get('origin'),fetchSite:request.headers.get('sec-fetch-site')};
 try{if(!authenticateAccountWebMutation(auth))return reply(404,'UNAVAILABLE');}catch{return reply(503,'UNAVAILABLE');}
 const {id}=await context.params;const match=request.headers.get('if-match');
 if(!uuid.test(id)||!match||!/^"[1-9][0-9]{0,9}"$/.test(match)||new URL(request.url).search||
 !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')||request.headers.has('content-encoding')||!request.body)return reply(400,'INVALID_REQUEST');
 const version=Number(match.slice(1,-1));
 if(version>=2147483647)return reply(400,'INVALID_REQUEST');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>LIMIT))return reply(400,'INVALID_REQUEST');
 let body:unknown;
 const reader=request.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try{
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>LIMIT){await reader.cancel();return reply(400,'INVALID_REQUEST');}text+=decoder.decode(value,{stream:true});}
  body=JSON.parse(text+decoder.decode());
 }catch{return reply(400,'INVALID_REQUEST');}finally{reader.releaseLock();}
 if(!validProfessionalEdit(body))return reply(400,'INVALID_REQUEST');
 try{
  const result=await updateOwnProfessionalProfile({...auth,id:id.toLowerCase(),version,body});
  return result==='updated'?reply(200,'UPDATED'):reply(409,'CONFLICT');
 }catch{return reply(503,'UNAVAILABLE');}
}
