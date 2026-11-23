export const MAX_REQUEST_BYTES:number;
export class CustomerCreateTransportUnavailable extends Error {}
export type CustomerCreateBody={
 service_offer_id:string;note:string|null;consent_to_contact:true;
};
export function validateCustomerCreateBody(raw:unknown):CustomerCreateBody;
export function parseCustomerCreateBytes(bytes:Uint8Array):CustomerCreateBody;
export function readCustomerCreateBody(
 stream:ReadableStream<Uint8Array>|null,
 signal?:AbortSignal,
):Promise<Uint8Array>;
export type CustomerCreateResult=
 |{kind:'created';id:string;version:1}
 |{kind:'conflict'}
 |{kind:'not_found'};
export function createBackendCustomerRequest(input:{
 baseUrl:string;production?:boolean;accountBearer:string;
 idempotencyKey:string;body:CustomerCreateBody;
 transport?:typeof fetch;
}):Promise<CustomerCreateResult>;
