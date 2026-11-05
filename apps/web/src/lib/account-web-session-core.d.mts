export type AccountWebSession=Readonly<{token:string;csrf:string;expiresAt:number;scope:'account:web'}>;
export function sealAccountWebSession(key:Buffer,accountToken:string,ttlSeconds:number,now?:number):
  {cookie:string;csrf:string;expiresAt:number};
export function openAccountWebSession(key:Buffer,cookie:unknown,now?:number):AccountWebSession|null;
export function verifyAccountCsrf(session:AccountWebSession|null,submitted:unknown):boolean;
export function verifyAccountMutationOrigin(origin:unknown,expectedOrigin:unknown,fetchSite:unknown):boolean;
