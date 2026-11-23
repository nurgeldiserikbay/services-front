export const ACCOUNT_OTP_PREAUTH_TTL_SECONDS:300;
export type AccountOtpPreauthSession={csrf:string;expiresAt:number};
export function sealAccountOtpPreauth(key:Buffer,now?:number):
 {cookie:string;csrf:string;expiresAt:number};
export function openAccountOtpPreauth(key:Buffer,cookie:unknown,now?:number):
 AccountOtpPreauthSession|null;
export function verifyAccountOtpPreauth(
 session:AccountOtpPreauthSession|null,submitted:unknown,
):boolean;
export function allowAccountOtpBootstrapOrigin(
 origin:string|null,fetchSite:string|null,expected:string,production:boolean,
):boolean;
