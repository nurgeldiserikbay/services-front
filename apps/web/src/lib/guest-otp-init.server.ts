import 'server-only';
import {sealOtpInitiation,openOtpInitiation,verifyOtpInitiation}
  from './guest-otp-init-core.mjs';
import {verifyMutationOrigin} from './guest-session-core.mjs';

export const GUEST_OTP_INIT_COOKIE='__Host-services_guest_otp_init';
export function otpInitKey():Buffer{
  const secret=process.env.SERVICES_WEB_GUEST_SESSION_KEY;
  if(!secret||!/^[A-Za-z0-9+/]{43}=$/.test(secret))
    throw new Error('otp_init_unavailable');
  const key=Buffer.from(secret,'base64');
  if(key.length!==32||key.toString('base64')!==secret)
    throw new Error('otp_init_unavailable');
  return key;
}
export function requireGuestOtpOrigin(
  origin:string|null,fetchSite:string|null,allowOriginAbsent=false,
):void{
  const expected=process.env.SERVICES_WEB_ORIGIN;
  if(!expected||(process.env.NODE_ENV==='production'&&!expected.startsWith('https://'))||
    (origin===null&&allowOriginAbsent
      ? !verifyMutationOrigin(expected,expected,fetchSite)
      : !verifyMutationOrigin(origin,expected,fetchSite)))
    throw new Error('otp_init_unavailable');
}
export function issueOtpInitiation(){
  const sealed=sealOtpInitiation(otpInitKey());
  return {csrf:sealed.csrf,cookie:{
    name:GUEST_OTP_INIT_COOKIE,value:sealed.cookie,
    options:{httpOnly:true as const,secure:true as const,
      sameSite:'strict' as const,path:'/' as const,maxAge:300},
  }};
}
export function authorizeOtpInitiation(cookie:unknown,csrf:unknown):void{
  if(!verifyOtpInitiation(openOtpInitiation(otpInitKey(),cookie),csrf))
    throw new Error('otp_init_unavailable');
}
export function clearOtpInitiation(){
  return {name:GUEST_OTP_INIT_COOKIE,value:'',
    options:{httpOnly:true as const,secure:true as const,
      sameSite:'strict' as const,path:'/' as const,maxAge:0}};
}
