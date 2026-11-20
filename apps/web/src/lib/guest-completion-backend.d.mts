export class GuestCompletionTransportUnavailable extends Error {constructor();}
export type GuestCompletionHttpInput={baseUrl:string|undefined;production?:boolean;
 requestId:string;transport?:typeof fetch};
export function requestGuestCompletionOtp(input:GuestCompletionHttpInput&{
 readCapability:string;networkProof:string;locale:'kk'|'ru';
}):Promise<{challengeId:string}>;
export function verifyGuestCompletionOtp(input:GuestCompletionHttpInput&{
 challengeId:string;code:string;now?:number;
}):Promise<{capability:string;expiresAt:number}>;
export function confirmGuestCompletionBackend(input:GuestCompletionHttpInput&{
 completionCapability:string;version:number;
}):Promise<{id:string;state:'completed';version:number}>;
