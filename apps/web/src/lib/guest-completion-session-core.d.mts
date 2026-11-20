export type GuestCompletionSession={requestId:string;value:string;expiresAt:number};
export function sealGuestCompletionSession(key:Buffer,
 purpose:'challenge'|'completion',requestId:string,value:string,
 expiresAt?:number,now?:number):string;
export function openGuestCompletionSession(key:Buffer,
 purpose:'challenge'|'completion',cookie:unknown,now?:number):GuestCompletionSession|null;
