import {NextRequest,NextResponse} from 'next/server';
import {
 ACCOUNT_OTP_CHALLENGE_COOKIE,authorizeAccountOtpChallenge,
 clearAccountOtpChallenge,requireAccountOtpChallengeKey,
} from '@/lib/account-otp-challenge-session.server';
import {ACCOUNT_WEB_COOKIE,requireAccountWebSessionKey}
 from '@/lib/account-web-session.server';
import {clearAccountOtpPreauth}
 from '@/lib/account-otp-preauth.server';
import {exchangeVerifiedAccountOtpForCookie}
 from '@/lib/account-login-bff.server';
import {AccountLoginTransportDenied}
 from '@/lib/account-login-private-transport.mjs';
import {
 readAccountOtpVerifyPayload,verifyAccountOtpMutationOrigin,
 MAX_ACCOUNT_OTP_VERIFY_BODY_BYTES,
} from '@/lib/account-otp-verify-route-core.mjs';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow',
 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
 'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
function reply(status:number,code:string){
 return NextResponse.json({code},{status,headers:HEADERS});
}

/** Prepared OTP verify boundary, independently default-off. A trusted server
 * must first issue a purpose-bound account challenge cookie after accepted
 * provider delivery. No browser can mint a valid sealed challenge cookie.
 *
 * The backend OTP verification is a one-use mutation: on uncertain failure
 * do NOT automatically retry; require a new challenge before another attempt.
 */
export async function POST(request:NextRequest):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_OTP_VERIFY_BFF!=='enabled')
  return reply(404,'UNAVAILABLE');
 if(!verifyAccountOtpMutationOrigin(
    request.headers.get('origin'),
    process.env.SERVICES_WEB_ORIGIN??'',
    request.headers.get('sec-fetch-site')))
  return reply(404,'UNAVAILABLE');
 if(new URL(request.url).search||
    request.headers.has('transfer-encoding')||
    request.cookies.has(ACCOUNT_WEB_COOKIE)||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get('content-type')??''))
  return reply(400,'INVALID_REQUEST');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
    Number(length)>MAX_ACCOUNT_OTP_VERIFY_BODY_BYTES))
  return reply(400,'INVALID_REQUEST');
 let payload;
 try{
  payload=await readAccountOtpVerifyPayload(request.body);
 }catch{
  return reply(400,'INVALID_REQUEST');
 }
 if(!payload)return reply(400,'INVALID_REQUEST');
 try{
  // Before consuming a one-use OTP, validate ALL local sealing keys.
  requireAccountOtpChallengeKey();
  requireAccountWebSessionKey();
  authorizeAccountOtpChallenge({
   cookieValue:request.cookies.get(ACCOUNT_OTP_CHALLENGE_COOKIE)?.value,
   challengeId:payload.challengeId,
   channel:payload.channel,csrfToken:payload.csrfToken,
  });
 }catch{
  return reply(404,'UNAVAILABLE');
 }
 try{
  const verified=await exchangeVerifiedAccountOtpForCookie({
   challengeId:payload.challengeId,channel:payload.channel,
   code:payload.code,
  });
  // Never serialize the backend bearer or new session cookie value in JSON.
  const response=NextResponse.json({
   code:'AUTHENTICATED',csrf_token:verified.csrf,
  },{status:200,headers:HEADERS});
  response.cookies.set(verified.setCookie.name,verified.setCookie.value,
   verified.setCookie.options);
  const cleared=clearAccountOtpChallenge();
  response.cookies.set(cleared.name,cleared.value,cleared.options);
  const clearedPreauth=clearAccountOtpPreauth();
  response.cookies.set(clearedPreauth.name,clearedPreauth.value,
   clearedPreauth.options);
  return response;
 }catch(error){
  if(error instanceof AccountLoginTransportDenied)
   return reply(401,'VERIFICATION_FAILED');
  // This is a potentially consumed backend code with an unconfirmed ack.
  // Never report success or retry the one-time OTP automatically.
  return reply(503,'UNAVAILABLE');
 }
}
