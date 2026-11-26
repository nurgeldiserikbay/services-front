export class GuestScheduleTransportUnavailable extends Error {}
type Base={baseUrl:string;production?:boolean;requestId:string;transport?:typeof fetch};
export function requestGuestScheduleOtp(options:Base&{readCapability:string;networkProof:string;locale:'kk'|'ru'}):Promise<{challengeId:string}>;
export function verifyGuestScheduleOtp(options:Base&{challengeId:string;code:string;now?:number}):Promise<{capability:string;expiresAt:number}>;
