export const MAX_ACCOUNT_OTP_START_BYTES:512;
export type AccountOtpStartPayload={
 channel:'EMAIL'|'SMS';contact:string;purpose:'SIGN_IN'|'SIGN_UP';
 locale:'kk'|'ru';csrfToken:string;
};
export function parseAccountOtpStart(value:unknown):AccountOtpStartPayload|null;
export function readAccountOtpStart(stream:ReadableStream<Uint8Array>|null):
 Promise<AccountOtpStartPayload|null>;
export function validateTrustedAccountOtpProof(proof:unknown):boolean;
export function startApprovedAccountOtp(input:{
 body:unknown;preauthCookie:string|undefined;
 existingChallengeCookie:string|undefined;existingAccountCookie:string|undefined;
 trustedNetworkProof:string;
 authorizePreauth:(cookie:string,csrf:string)=>void;
 requireChallengeKey:()=>void;
 issueChallenge:(input:{challengeId:string;channel:'EMAIL'|'SMS';expiresInSeconds:300})=>{
  csrf:string;cookie:{name:string;value:string;options:unknown};
 };
 dispatch:(input:{
  channel:'EMAIL'|'SMS';contact:string;purpose:'SIGN_IN'|'SIGN_UP';
  locale:'kk'|'ru';trustedNetworkProof:string;
 })=>Promise<{challengeId:string;expiresInSeconds:300}>;
}):Promise<{
 challengeId:string;csrf:string;expiresInSeconds:300;
 setCookie:{name:string;value:string;options:unknown};
}>;
