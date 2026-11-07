export class AccountLoginTransportUnavailable extends Error {}
export class AccountLoginTransportDenied extends Error {}
export function verifyBackendAccountOtp(options:{
 baseUrl:string;production?:boolean;serviceKey:string;challengeId:string;
 channel:'EMAIL'|'SMS';code:string;transport?:typeof fetch;
}):Promise<{sessionToken:string;expiresInSeconds:number}>;
