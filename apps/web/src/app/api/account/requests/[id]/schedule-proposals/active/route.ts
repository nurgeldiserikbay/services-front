import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getActiveAccountSchedule} from '@/lib/account-session-bff.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const headers={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Cookie, Sec-Fetch-Site'};
const reply=(status:number)=>NextResponse.json({code:'UNAVAILABLE'},{status,headers});
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||process.env.SERVICES_WEB_ENABLE_ACCOUNT_SCHEDULE!=='enabled')return reply(404);
 const {id}=await context.params;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||
  new URL(request.url).search||request.headers.has('authorization')||request.headers.has('guest-capability')||
  request.headers.get('sec-fetch-site')!=='same-origin')return reply(404);
 try{
  const view=await getActiveAccountSchedule(request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,id);
  return NextResponse.json(view,{status:200,headers});
 }catch{return reply(404);}
}
