import {NextRequest,NextResponse} from 'next/server';
import {confirmGuestChallenge,GUEST_CHALLENGE_COOKIE}
  from '@/lib/guest-otp-bff.server';
import {MAX_OTP_VERIFY_BODY,readGuestOtpVerifyBody}
  from '@/lib/guest-otp-verify-route-core.mjs';

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
    {code:'UNAVAILABLE',message:'Verification unavailable'},
    {status,headers:PRIVATE_HEADERS},
  );
}

/**
 * No OTP issue route is mounted by this change. The challenge and its
 * synchronizer token must already exist in a server-created HttpOnly session.
 * Verifying creates a scoped HttpOnly CREATE_REQUEST cookie, not a bearer
 * token exposed to JavaScript. Disabled unless BOTH web gates are enabled.
 */
export async function POST(request:NextRequest):Promise<NextResponse>{
  if(process.env.SERVICES_WEB_ENABLE_GUEST_OTP_VERIFY_HTTP!=='enabled'||
     process.env.SERVICES_WEB_ENABLE_GUEST_OTP_BFF!=='enabled')
    return unavailable(404);

  try{
    if(!/^application\/json(?:\s*;|\s*$)/i.test(
      request.headers.get('content-type')??'',
    ))return unavailable(503);
    const declared=request.headers.get('content-length');
    if(declared!==null&&(!/^\d+$/.test(declared)||
      Number(declared)>MAX_OTP_VERIFY_BODY))
      return unavailable(503);

    const {challengeId,code,csrfToken}=
      await readGuestOtpVerifyBody(request.body);
    const result=await confirmGuestChallenge({
      challengeId,code,csrfToken,
      cookieValue:request.cookies.get(GUEST_CHALLENGE_COOKIE)?.value,
      origin:request.headers.get('origin'),
      fetchSite:request.headers.get('sec-fetch-site'),
    });

    // Never stringify result: it includes HttpOnly cookie instructions.
    const response=NextResponse.json(
      {verified:true,csrf_token:result.csrf},
      {status:200,headers:PRIVATE_HEADERS},
    );
    response.cookies.set(
      result.setCookie.name,result.setCookie.value,result.setCookie.options,
    );
    response.cookies.set(
      result.clearCookie.name,result.clearCookie.value,result.clearCookie.options,
    );
    return response;
  }catch{
    // No cookie mutation on failure: preserve the challenge for bounded
    // server-side retry. Backend enforces OTP attempt and expiry budgets.
    return unavailable(503);
  }
}
