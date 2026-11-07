export type AccountDeviceItem={
 id:string;deviceLabel:string|null;lastUsedAt:string|null;
 expiresAt:string;current:boolean;
};
export type AccountDeviceInventory={items:AccountDeviceItem[];csrf:string};
export class AccountDeviceUnavailable extends Error{}
export class AccountDeviceAuthenticationRequired extends Error{}
export function parseAccountDeviceInventory(value:unknown):AccountDeviceInventory;
export function loadAccountDevices(input?:{transport?:typeof fetch}):Promise<AccountDeviceInventory>;
export function revokeOtherAccountDevice(input:{
 sessionId:string;csrf:string;transport?:typeof fetch;
}):Promise<'ok'|'authentication_required'|'current_session'|'unavailable'>;
