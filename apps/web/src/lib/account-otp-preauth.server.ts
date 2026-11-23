import 'server-only';
import {
 sealAccountOtpPreauth,openAccountOtpPreauth,
 verifyAccountOtpPreauth,allowAccountOtpBootstrapOrigin,
} from './account-otp-preauth-core.mjs';

export const ACCOUNT_OTP_PREAUTH_COOKIE='__Host-services_account_otp_preauth';
function secret():Buffer{
 const raw=process.env.SERVICES_WEB_ACCOUNT_OTP_PREAUTH_KEY;
 if(!raw||!/^[A-Za-z0-9+/]{43}=$/.test(raw))
  throw new Error('Account OTP preauth unavailable');
 const result=Buffer.from(raw,'base64');
 if(result.length!==32||result.toString('base64')!==raw)
  throw new Error('Account OTP preauth unavailable');
 return result;
}
export function requireAccountOtpBootstrapOrigin(
 origin:string|null,fetchSite:string|null,
):void{
 if(!allowAccountOtpBootstrapOrigin(
  origin,fetchSite,process.env.SERVICES_WEB_ORIGIN??'',
  process.env.NODE_ENV==='production'))
  throw new Error('Account OTP preauth unavailable');
}
export function issueAccountOtpPreauth(){
 const sealed=sealAccountOtpPreauth(secret());
 return {csrf:sealed.csrf,expiresAt:sealed.expiresAt,cookie:{
  name:ACCOUNT_OTP_PREAUTH_COOKIE,value:sealed.cookie,
  options:{httpOnly:true as const,secure:true as const,
   sameSite:'strict' as const,path:'/' as const,maxAge:300},
 }};
}
export function authorizeAccountOtpPreauth(
 cookie:unknown,csrf:unknown,
):void{
 const session=openAccountOtpPreauth(secret(),cookie);
 if(!verifyAccountOtpPreauth(session,csrf))
  throw new Error('Account OTP preauth unavailable');
}
export function clearAccountOtpPreauth(){
 return {name:ACCOUNT_OTP_PREAUTH_COOKIE,value:'',
  options:{httpOnly:true as const,secure:true as const,
   sameSite:'strict' as const,path:'/' as const,maxAge:0}};
}
