export type GuestCreateBody={
  service_offer_id:string;
  consent_to_contact:true;
  note?:string;
};
export type InternalCommittedGuestRequest={
  id:string;
  state:'pending';
  requestCapability:string;
  expiresAt:string;
};
export class GuestCreateUnavailable extends Error{
  constructor();
}
export function sendVerifiedGuestCreate(input:{
  baseUrl:string|undefined;
  production?:boolean;
  createCapability:string;
  idempotencyKey:string;
  body:unknown;
  transport?:typeof fetch;
  now?:number;
}):Promise<InternalCommittedGuestRequest>;
