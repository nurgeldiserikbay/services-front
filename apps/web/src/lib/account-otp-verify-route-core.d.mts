export const MAX_ACCOUNT_OTP_VERIFY_BODY_BYTES:512;
export type AccountOtpVerifyPayload={
 challengeId:string;channel:'EMAIL'|'SMS';code:string;csrfToken:string;
};
export function verifyAccountOtpMutationOrigin(
 origin:string|null,expected:string,fetchSite:string|null,
):boolean;
export function validateAccountOtpVerifyPayload(
 value:unknown,
):AccountOtpVerifyPayload|null;
export function readAccountOtpVerifyPayload(
 stream:ReadableStream<Uint8Array>|null,
):Promise<AccountOtpVerifyPayload|null>;
