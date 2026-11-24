export type AccountLogoutOutcome='confirmed'|'local_only'|'unavailable';
export function logoutCurrentAccount(input?:{
 transport?:typeof fetch;
 loadDevices?:(input?:{transport?:typeof fetch})=>Promise<{csrf:string}>;
}):Promise<AccountLogoutOutcome>;
