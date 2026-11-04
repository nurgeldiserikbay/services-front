export const GUEST_CREATE_MAX_BODY_BYTES:number;
export type GuestCreateRouteInput=Readonly<{
  csrfToken:string;
  idempotencyKey:string;
  body:Readonly<{
    service_offer_id:string;
    note?:string;
    consent_to_contact:true;
  }>;
}>;
export function validateGuestCreateRouteBody(raw:unknown):GuestCreateRouteInput;
export function parseGuestCreateRequestBytes(bytes:ArrayBuffer):GuestCreateRouteInput;
export function readBoundedGuestCreateBody(stream:ReadableStream<Uint8Array>|null):Promise<ArrayBuffer>;
