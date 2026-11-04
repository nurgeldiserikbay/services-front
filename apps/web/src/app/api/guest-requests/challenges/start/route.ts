import {NextRequest,NextResponse} from 'next/server';
import {startGuestChallenge} from '@/lib/guest-otp-bff.server';
import {
  issueOtpInitiation,authorizeOtpInitiation,requireGuestOtpOrigin,
  GUEST_OTP_INIT_COOKIE,clearOtpInitiation,
} from '@/lib/guest-otp-init.server';
import {readOtpStartBody,MAX_OTP_START_BODY_BYTES}
  from '@/lib/guest-otp-start-core.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

const PRIVATE_HEADERS={
  'Cache-Control':'private, no-store, max-age=0',
  'Pragma':'no-cache',
  'X-Robots-Tag':'noindex, nofollow',
  'Referrer-Policy':'no-referrer',
  'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;

function unavailable(status:404|503):NextResponse{
  return NextResponse.json(
    {code:'UNAVAILABLE',message:'OTP temporarily unavailable'},
    {status,headers:PRIVATE_HEADERS},
  );
}
function enabled():boolean{
  return process.env.SERVICES_WEB_ENABLE_GUEST_OTP_START_HTTP==='enabled'&&
    process.env.SERVICES_WEB_ENABLE_GUEST_OTP_BFF==='enabled';
}

/** Same-origin CSRF bootstrap. This GET never issues an OTP or accepts IPs. */
export async function GET(request:NextRequest):Promise<NextResponse>{
  if(!enabled())return unavailable(404);
  try{
    requireGuestOtpOrigin(
      request.headers.get('origin'),
      request.headers.get('sec-fetch-site'),true,
    );
    const issued=issueOtpInitiation();
    const response=NextResponse.json(
      {csrf_token:issued.csrf,expires_in:300},
      {status:200,headers:PRIVATE_HEADERS},
    );
    response.cookies.set(
      issued.cookie.name,issued.cookie.value,issued.cookie.options,
    );
    return response;
  }catch{return unavailable(503);}
}

/**
 * The frontend never signs or invents a network bucket. Backend issuance
 * requires a real trusted-edge X-Services-Network-Proof and will fail
 * closed until deployment provisions that signer + provider.
 */
export async function POST(request:NextRequest):Promise<NextResponse>{
  if(!enabled())return unavailable(404);
  try{
    requireGuestOtpOrigin(
      request.headers.get('origin'),
      request.headers.get('sec-fetch-site'),
    );
    if(!/^application\/json(?:\s*;|\s*$)/i.test(
      request.headers.get('content-type')??'',
    ))return unavailable(503);
    const declared=request.headers.get('content-length');
    if(declared!==null&&(!/^\d+$/.test(declared)||
      Number(declared)>MAX_OTP_START_BODY_BYTES))
      return unavailable(503);
    const input=await readOtpStartBody(request.body);
    authorizeOtpInitiation(
      request.cookies.get(GUEST_OTP_INIT_COOKIE)?.value,input.csrfToken,
    );
    const started=await startGuestChallenge({
      channel:input.channel,contact:input.contact,locale:input.locale,
      origin:request.headers.get('origin'),
      fetchSite:request.headers.get('sec-fetch-site'),
    });
    // Only a newly issued challenge and synchronizer reach the browser.
    const response=NextResponse.json({
      challenge_id:started.challengeId,
      expires_in:started.expiresInSeconds,
      csrf_token:started.csrf,
    },{status:202,headers:PRIVATE_HEADERS});
    response.cookies.set(
      started.setCookie.name,started.setCookie.value,
      started.setCookie.options,
    );
    const cleared=clearOtpInitiation();
    response.cookies.set(cleared.name,cleared.value,cleared.options);
    return response;
  }catch{return unavailable(503);}
}
