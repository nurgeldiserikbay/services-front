import 'server-only';
import {startApprovedAccountOtp} from './account-otp-start-core.mjs';
import {requireAccountOtpCompletionKeys}
 from './account-otp-completion-preflight.mjs';
import {authorizeAccountOtpPreauth}
 from './account-otp-preauth.server';
import {
 requireAccountOtpChallengeKey,issueAccountOtpChallenge,
} from './account-otp-challenge-session.server';
import {initiateApprovedAccountOtp}
 from './account-otp-init-bff.server';

/**
 * Internal TRUSTED-INGRESS-ONLY seam. It is deliberately NOT mounted as an
 * app/api route: the deployer must first prove spoofed proxy proof headers
 * are stripped, the source is attested by an approved edge, and the caller
 * has completed strict Origin/Fetch-Metadata and anti-abuse checks.
 *
 * No browser-controlled X-Forwarded-For, X-Real-IP or
 * X-Services-Network-Proof may be passed as trustedNetworkProof.
 */
export async function startTrustedAccountOtp(input:{
 body:unknown;preauthCookie:string|undefined;
 existingChallengeCookie:string|undefined;existingAccountCookie:string|undefined;
 trustedNetworkProof:string;
}){
 if(process.env.SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_OTP_BOOTSTRAP!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_OTP_INIT_BFF!=='enabled')
  throw new Error('Account OTP start unavailable');
 // All future cookie and backend authorization secrets must exist and
 // belong to independent security domains BEFORE any OTP is dispatched.
 requireAccountOtpCompletionKeys({
  preauth:process.env.SERVICES_WEB_ACCOUNT_OTP_PREAUTH_KEY,
  challenge:process.env.SERVICES_WEB_ACCOUNT_OTP_CHALLENGE_KEY,
  session:process.env.SERVICES_WEB_ACCOUNT_SESSION_KEY,
  privateBff:process.env.SERVICES_WEB_ACCOUNT_LOGIN_BFF_KEY,
 });
 return startApprovedAccountOtp({
  ...input,authorizePreauth:authorizeAccountOtpPreauth,
  requireChallengeKey:requireAccountOtpChallengeKey,
  issueChallenge:issueAccountOtpChallenge,
  dispatch:initiateApprovedAccountOtp,
 });
}
