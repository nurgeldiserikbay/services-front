export const MAX_OTP_START_BODY_BYTES:number;
export type OtpStartInput=Readonly<{
  channel:'sms'|'email';contact:string;locale:'kk'|'ru';csrfToken:string;
}>;
export function validateOtpStartInput(raw:unknown):OtpStartInput;
export function readOtpStartBody(stream:ReadableStream<Uint8Array>|null):Promise<OtpStartInput>;
