import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE,clearAccountWebSession,authenticateAccountWebMutation}
 from '@/lib/account-web-session.server';
import {revokeAccountWebSession} from '@/lib/account-session-bff.server';
import {sellerBffSameOrigin} from '@/lib/seller-bff-route-core.mjs';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
/**
 * Only valid same-origin+CSRF requests may clear the account cookie.
 * Never allow cross-site requests to force the user out.
 * A failed backend revocation results in 503 (NOT success) with the local
 * cookie cleared; the backend proof may remain valid until its expiry.
 */
export async function POST(request:NextRequest):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    !sellerBffSameOrigin(request.headers.get('sec-fetch-site')))
  return NextResponse.json({code:'UNAVAILABLE'},{status:404,headers:HEADERS});
 if(new URL(request.url).search||
    (request.headers.has('content-length')&&request.headers.get('content-length')!=='0')||
    request.headers.has('transfer-encoding'))
  return NextResponse.json({code:'INVALID_REQUEST'},{status:400,headers:HEADERS});
 const input={
  cookieValue:request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,
  csrfToken:request.headers.get('x-services-csrf')??undefined,
  origin:request.headers.get('origin'),
  fetchSite:request.headers.get('sec-fetch-site'),
 };
 // Authenticate before changing the cookie: an unauthenticated cross-site
 // request must never be allowed to log out an existing account.
 if(!authenticateAccountWebMutation(input))
  return NextResponse.json({code:'UNAVAILABLE'},{status:404,headers:HEADERS});
 let backendOk=false;
 try{
  await revokeAccountWebSession(input);
  backendOk=true;
 }catch{
  // Backend revocation is unconfirmed; clear local cookie anyway.
 }
 const response=backendOk
  ?new NextResponse(null,{status:204,headers:HEADERS})
  :NextResponse.json({code:'UNAVAILABLE'},{status:503,headers:HEADERS});
 response.cookies.set(clearAccountWebSession());
 return response;
}
