import {NextRequest,NextResponse} from 'next/server';
import {GUEST_REQUEST_COOKIE,readGuestRequestMutationCsrf}
 from '@/lib/guest-request-access.server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

const HEADERS={
 'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Sec-Fetch-Site',
} as const;

const unavailable=()=>NextResponse.json({code:'UNAVAILABLE'},
 {status:404,headers:HEADERS});

/**
 * Default-off, same-origin-only CSRF bootstrap for a scoped guest receipt.
 * No OTP is dispatched, no backend write occurs and no bearer is returned.
 * A trusted edge still must strip/re-sign the completion network attestation.
 */
export async function GET(request:NextRequest,
 context:{params:Promise<{id:string}>}):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_GUEST_COMPLETION_BFF!=='enabled')
  return unavailable();
 try{
  if(new URL(request.url).search)return unavailable();
  const {id}=await context.params;
  const csrf=readGuestRequestMutationCsrf({
   requestId:id,
   cookieValue:request.cookies.get(GUEST_REQUEST_COOKIE)?.value,
   fetchSite:request.headers.get('sec-fetch-site'),
  });
  if(!csrf)return unavailable();
  return NextResponse.json({csrf_token:csrf},{status:200,headers:HEADERS});
 }catch{return unavailable();}
}
