export const OTP_INIT_TTL_SECONDS:number;
export type OtpInitSession=Readonly<{csrf:string;expiresAt:number}>;
export function sealOtpInitiation(key:Buffer,now?:number):Readonly<{cookie:string;csrf:string;expiresAt:number}>;
export function openOtpInitiation(key:Buffer,cookie:unknown,now?:number):OtpInitSession|null;
export function verifyOtpInitiation(session:OtpInitSession|null,submitted:unknown):boolean;
