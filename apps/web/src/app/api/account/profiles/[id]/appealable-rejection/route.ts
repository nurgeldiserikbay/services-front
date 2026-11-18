import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getOwnAppealableProfileRejection} from '@/lib/account-session-bff.server';
export const runtime='nodejs';export const dynamic='force-dynamic';export const revalidate=0;
const headers={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow','Vary':'Cookie'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
  process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILES!=='enabled'||
  process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_APPEALS!=='enabled')
  return NextResponse.json({code:'UNAVAILABLE'},{status:404,headers});
 const {id}=await context.params;
 if(!uuid.test(id)||new URL(request.url).search)
  return NextResponse.json({code:'UNAVAILABLE'},{status:404,headers});
 try{
  const result=await getOwnAppealableProfileRejection(request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,id);
  return NextResponse.json(result,{status:200,headers});
 }catch{return NextResponse.json({code:'UNAVAILABLE'},{status:404,headers});}
}
