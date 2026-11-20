import {NextRequest,NextResponse} from 'next/server';
import {GUEST_REQUEST_COOKIE} from '@/lib/guest-request-access.server';
import {COMPLETION_PROOF_COOKIE,confirmGuestCompletion}
 from '@/lib/guest-completion-bff.server';
import {readGuestCompletionBody} from '@/lib/guest-completion-body.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const HEADERS={'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Origin, Sec-Fetch-Site'} as const;
const denied=(status:404|503|409)=>NextResponse.json({code:'UNAVAILABLE'},
 {status,headers:HEADERS});

/**
 * A lost upstream COMMIT acknowledgement returns 503 and preserves cookie.
 * The client must refresh scoped status before any repeat. Never claim
 * completion or expose a guest bearer to browser code on uncertain outcome.
 */
export async function POST(request:NextRequest,
 context:{params:Promise<{id:string}>}):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_GUEST_COMPLETION_BFF!=='enabled')
  return denied(404);
 try{
  if(new URL(request.url).search)return denied(404);
  const body=await readGuestCompletionBody(request);
  const expected=request.headers.get('if-match');
  if(Object.keys(body).length!==0||
   !expected||!/^"[1-9][0-9]{0,9}"$/.test(expected))
   return denied(409);
  const version=Number(expected.slice(1,-1));
  if(!Number.isSafeInteger(version)||version>2147483646)
   return denied(409);
  const {id}=await context.params;
  const outcome=await confirmGuestCompletion({
   requestId:id,version,
   cookieValue:request.cookies.get(GUEST_REQUEST_COOKIE)?.value,
   completionCookieValue:request.cookies.get(COMPLETION_PROOF_COOKIE)?.value,
   csrfToken:request.headers.get('x-services-csrf')??undefined,
   origin:request.headers.get('origin'),
   fetchSite:request.headers.get('sec-fetch-site'),
  });
  const response=NextResponse.json({code:'COMPLETED',id:outcome.result.id,
   version:outcome.result.version},{status:200,headers:HEADERS});
  response.cookies.set(outcome.clearCookie.name,outcome.clearCookie.value,
   outcome.clearCookie.options);
  return response;
 }catch{return denied(503);}
}
