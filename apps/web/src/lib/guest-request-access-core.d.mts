export interface GuestRequestAccess {
  readonly requestId:string;
  readonly capability:string;
  readonly csrf:string;
  readonly scope:'guest:read_cancel';
  readonly expiresAt:number;
}
export function sealGuestRequestAccess(key:Buffer,requestId:string,capability:string,
  expiresAt:number,now?:number):{cookie:string;csrf:string;expiresAt:number};
export function openGuestRequestAccess(key:Buffer,cookie:unknown,now?:number):GuestRequestAccess|null;
export function verifyGuestRequestAccess(session:GuestRequestAccess|null,requestId:unknown,
  csrf:unknown):boolean;
