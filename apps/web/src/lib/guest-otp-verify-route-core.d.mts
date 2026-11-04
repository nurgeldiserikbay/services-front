export const MAX_OTP_VERIFY_BODY:number;
export type GuestOtpVerifyRequest=Readonly<{
  challengeId:string;
  csrfToken:string;
  code:string;
}>;
export function parseGuestOtpVerifyBody(raw:unknown):GuestOtpVerifyRequest;
export function readGuestOtpVerifyBody(
  stream:ReadableStream<Uint8Array>|null,
):Promise<GuestOtpVerifyRequest>;
