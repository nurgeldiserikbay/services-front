import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE,authenticateAccountWebMutation}
 from '@/lib/account-web-session.server';
import {revokeOtherAccountWebSession}
 from '@/lib/account-session-bff.server';
import {sellerBffSameOrigin} from '@/lib/seller-bff-route-core.mjs';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
const fail=(status:400|404|409|503)=>NextResponse.json({
 code:status===400?'INVALID_REQUEST':status===409?'CURRENT_SESSION':'UNAVAILABLE',
},{status,headers:HEADERS});

/** Browser never sees a bearer. Remote-only; current session uses logout. */
export async function DELETE(
 request:NextRequest,context:{params:Promise<{id:string}>},
):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    !sellerBffSameOrigin(request.headers.get('sec-fetch-site')))
  return fail(404);
 const {id}=await context.params;
 if(!UUID.test(id)||new URL(request.url).search||
    (request.headers.has('content-length')&&request.headers.get('content-length')!=='0')||
    request.headers.has('transfer-encoding'))
  return fail(400);
 const input={
  cookieValue:request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,
  csrfToken:request.headers.get('x-services-csrf')??undefined,
  origin:request.headers.get('origin'),
  fetchSite:request.headers.get('sec-fetch-site'),
 };
 // Match the existing logout BFF: untrusted requests are not authorized
 // to alter session state, and cannot learn account session existence.
 if(!authenticateAccountWebMutation(input))return fail(404);
 try{
  const result=await revokeOtherAccountWebSession({...input,sessionId:id.toLowerCase()});
  if(result==='current')return fail(409);
  if(result==='not_found')return fail(404);
  return new NextResponse(null,{status:204,headers:HEADERS});
 }catch{return fail(503);}
}
