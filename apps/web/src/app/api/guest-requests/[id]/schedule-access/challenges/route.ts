import {NextRequest,NextResponse} from 'next/server';
import {GUEST_REQUEST_COOKIE} from '@/lib/guest-request-access.server';
import {startGuestScheduleChallenge} from '@/lib/guest-schedule-bff.server';
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

/** Default-off. Trusted ingress must strip and sign network-proof header. */
export async function POST(request:NextRequest,
 context:{params:Promise<{id:string}>}):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_GUEST_SCHEDULE_BFF!=='enabled')
  return denied(404);
 try{
  if(new URL(request.url).search||request.headers.has('authorization')||request.headers.has('guest-capability')||request.headers.has('guest-completion-capability'))return denied(404);
  const body=await readGuestCompletionBody(request);
  if(Object.keys(body).length!==1||
    (body.locale!=='kk'&&body.locale!=='ru'))return denied(404);
  const {id}=await context.params;
  const result=await startGuestScheduleChallenge({
   requestId:id,locale:body.locale,
   cookieValue:request.cookies.get(GUEST_REQUEST_COOKIE)?.value,
   csrfToken:request.headers.get('x-services-csrf')??undefined,
   origin:request.headers.get('origin'),
   fetchSite:request.headers.get('sec-fetch-site'),
   networkProof:request.headers.get('x-services-network-proof'),
  });
  const response=NextResponse.json({challenge_id:result.challengeId},
   {status:202,headers:HEADERS});
  response.cookies.set(result.setCookie.name,result.setCookie.value,
   result.setCookie.options);
  return response;
 }catch{return denied(503);}
}
