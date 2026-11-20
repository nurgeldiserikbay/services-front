import {NextRequest,NextResponse} from 'next/server';
import {GUEST_REQUEST_COOKIE} from '@/lib/guest-request-access.server';
import {COMPLETION_CHALLENGE_COOKIE,verifyGuestCompletionChallenge}
 from '@/lib/guest-completion-bff.server';
import {readGuestCompletionBody} from '@/lib/guest-completion-body.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const HEADERS={'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Origin, Sec-Fetch-Site'} as const;
const denied=(status:404|503)=>NextResponse.json({code:'UNAVAILABLE'},
 {status,headers:HEADERS});

/** Verification returns no proof to browser JavaScript; capability is sealed. */
export async function POST(request:NextRequest,
 context:{params:Promise<{id:string;challengeId:string}>}):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_GUEST_COMPLETION_BFF!=='enabled')
  return denied(404);
 try{
  if(new URL(request.url).search)return denied(404);
  const body=await readGuestCompletionBody(request);
  if(Object.keys(body).length!==1||
   typeof body.code!=='string'||!/^[0-9]{6}$/.test(body.code))
   return denied(404);
  const {id,challengeId}=await context.params;
  const result=await verifyGuestCompletionChallenge({
   requestId:id,challengeId,code:body.code,
   cookieValue:request.cookies.get(GUEST_REQUEST_COOKIE)?.value,
   challengeCookieValue:request.cookies.get(COMPLETION_CHALLENGE_COOKIE)?.value,
   csrfToken:request.headers.get('x-services-csrf')??undefined,
   origin:request.headers.get('origin'),
   fetchSite:request.headers.get('sec-fetch-site'),
  });
  const response=NextResponse.json({verified:true},
   {status:200,headers:HEADERS});
  response.cookies.set(result.setCookie.name,result.setCookie.value,
   result.setCookie.options);
  response.cookies.set(result.clearCookie.name,result.clearCookie.value,
   result.clearCookie.options);
  return response;
 }catch{return denied(503);}
}
