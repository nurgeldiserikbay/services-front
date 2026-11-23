export class AccountOtpInitiationUnavailable extends Error {}
export function initiateBackendAccountOtp(input:{
 baseUrl:string;production?:boolean;serviceKey:string;networkProof:string;
 channel:'EMAIL'|'SMS';contact:string;purpose:'SIGN_IN'|'SIGN_UP';
 locale:'kk'|'ru';transport?:typeof fetch;
}):Promise<{challengeId:string;expiresInSeconds:300}>;
