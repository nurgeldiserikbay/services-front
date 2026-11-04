export class GuestOtpUnavailable extends Error{constructor();}
export type OtpTransportInput=Readonly<{
  baseUrl:string|undefined;
  production?:boolean;
  transport?:typeof fetch;
}>;
export function issueGuestOtpChallenge(input:OtpTransportInput&{
  channel:'email'|'sms';contact:string;locale:'kk'|'ru';
}):Promise<{challengeId:string}>;
export function verifyGuestOtpChallenge(input:OtpTransportInput&{
  challengeId:string;code:string;now?:number;
}):Promise<{createCapability:string;expiresInSeconds:number}>;
