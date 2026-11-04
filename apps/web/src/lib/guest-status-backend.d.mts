export type PrivateGuestStatus=Readonly<{
  id:string;
  serviceOfferId:string;
  state:'pending'|'accepted'|'declined'|'completed'|'expired'|
    'cancelled_by_customer'|'cancelled_by_provider'|'cancelled_mutual';
  version:number;
  createdAt:string;
}>;
export class GuestStatusUnavailable extends Error{constructor();}
export function readGuestRequestStatus(input:{
  baseUrl:string|undefined;
  production?:boolean;
  requestId:string;
  requestCapability:string;
  transport?:typeof fetch;
}):Promise<PrivateGuestStatus>;
