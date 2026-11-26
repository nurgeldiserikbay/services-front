type Purpose='challenge'|'schedule';
export function sealGuestScheduleSession(key:Buffer,purpose:Purpose,requestId:string,value:string,expiresAt?:number,now?:number):string;
export function openGuestScheduleSession(key:Buffer,purpose:Purpose,cookie:unknown,now?:number):{requestId:string;value:string;expiresAt:number}|null;
