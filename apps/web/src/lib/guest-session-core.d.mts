export interface GuestSession {
  readonly capability:string;
  readonly csrf:string;
  readonly expiresAt:number;
  readonly scope:'guest:create_request';
}
export function sealGuestSession(key:Buffer,capability:string,ttlSeconds?:number,now?:number):{
  cookie:string;csrf:string;expiresAt:number;
};
export function openGuestSession(key:Buffer,cookie:unknown,now?:number):GuestSession|null;
export function verifyGuestCsrf(session:GuestSession|null,submitted:unknown):boolean;
export function verifyMutationOrigin(origin:unknown,expectedOrigin:unknown,fetchSite?:string|null):boolean;
