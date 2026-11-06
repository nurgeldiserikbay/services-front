export class AccountSessionTransportUnavailable extends Error {}
export type AccountSessionTransportOptions={
 baseUrl:string;production?:boolean;accountBearer:string;transport?:typeof fetch;
};
export type AccountSessionInventory={
 items:Array<{id:string;deviceLabel:string|null;lastUsedAt:string|null;expiresAt:string;current:boolean}>;
};
export function listBackendAccountSessions(
 options:AccountSessionTransportOptions,
):Promise<AccountSessionInventory>;
export function revokeBackendAccountSession(
 options:AccountSessionTransportOptions,
):Promise<true>;
