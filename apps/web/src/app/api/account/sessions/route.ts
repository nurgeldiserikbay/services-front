import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getAccountWebSessions} from '@/lib/account-session-bff.server';
import {sellerBffSameOrigin} from '@/lib/seller-bff-route-core.mjs';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
export async function GET(request:NextRequest):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    !sellerBffSameOrigin(request.headers.get('sec-fetch-site')))
  return NextResponse.json({code:'UNAVAILABLE'},{status:404,headers:HEADERS});
 if(new URL(request.url).search)
  return NextResponse.json({code:'INVALID_REQUEST'},{status:400,headers:HEADERS});
 try{
  const sessions=await getAccountWebSessions(
   request.cookies.get(ACCOUNT_WEB_COOKIE)?.value);
  return NextResponse.json(sessions,{status:200,headers:HEADERS});
 }catch{
  return NextResponse.json({code:'UNAVAILABLE'},{status:503,headers:HEADERS});
 }
}
