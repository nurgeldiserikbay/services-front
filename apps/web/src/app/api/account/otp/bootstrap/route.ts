import {NextRequest,NextResponse} from 'next/server';
import {
 issueAccountOtpPreauth,requireAccountOtpBootstrapOrigin,
} from '@/lib/account-otp-preauth.server';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';

const HEADERS={
 'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow',
 'Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff',
 'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;

/** Only issues a short-lived anti-CSRF synchronizer; NEVER contacts an OTP
 * provider or authenticates a user. Disabled independently by default.
 * Must be fetched from same-origin JS so Sec-Fetch-Site is present.
 */
export async function GET(request:NextRequest):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_OTP_BOOTSTRAP!=='enabled')
  return NextResponse.json({code:'UNAVAILABLE'},{status:404,headers:HEADERS});
 try{
  requireAccountOtpBootstrapOrigin(
   request.headers.get('origin'),request.headers.get('sec-fetch-site'));
 }catch{
  return NextResponse.json({code:'UNAVAILABLE'},{status:404,headers:HEADERS});
 }
 if(new URL(request.url).search||
    request.headers.has('transfer-encoding')||
    (request.headers.has('content-length')&&
     request.headers.get('content-length')!=='0'))
  return NextResponse.json({code:'INVALID_REQUEST'},{status:400,headers:HEADERS});
 try{
  const issued=issueAccountOtpPreauth();
  const response=NextResponse.json({
   csrf_token:issued.csrf,expires_in_seconds:300,
  },{status:200,headers:HEADERS});
  response.cookies.set(issued.cookie.name,issued.cookie.value,
   issued.cookie.options);
  return response;
 }catch{
  return NextResponse.json({code:'UNAVAILABLE'},{status:503,headers:HEADERS});
 }
}
