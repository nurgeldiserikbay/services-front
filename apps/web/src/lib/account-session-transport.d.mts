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

export function revokeBackendAccountSessionById(
 options:AccountSessionTransportOptions&{sessionId:string},
):Promise<true>;

export function readBackendAccountMe(options:AccountSessionTransportOptions):
 Promise<{user_id:string;person_id:string}>;

export type OwnProfessionalProfile={id:string;profession_id:string;lifecycle_status:'draft'|'published'|'paused'|'archived';slug:string;title:string|null;about:string|null;version:number;offers:Array<{id:string;title:string;delivery_mode:string;price_label:string|null}>};
export function listBackendProfessionalProfiles(options:AccountSessionTransportOptions):Promise<OwnProfessionalProfile[]>;

export function createBackendProfessionalProfile(options:AccountSessionTransportOptions&{professionId:string;idempotencyKey:string}):Promise<'created'|'conflict'>;

export type ProfessionalEdit={title?:string;about?:string};
export function validProfessionalEdit(body:unknown):body is ProfessionalEdit;
export function updateBackendProfessionalProfile(options:AccountSessionTransportOptions&{id:string;version:number;body:ProfessionalEdit}):Promise<'updated'|'conflict'>;

export type ProfessionalProfilePreview={
 id:string;slug:string;profession_id:string;
 lifecycle_status:'draft'|'published'|'paused'|'archived';
 draft:{title:string|null;about:string|null;version:number};
 published:{title:string|null;about:string|null;version:number}|null;
};
export function readBackendProfessionalProfilePreview(options:AccountSessionTransportOptions&{profileId:string}):Promise<ProfessionalProfilePreview>;

export function publishBackendProfessionalProfile(options:AccountSessionTransportOptions&{id:string;version:number}):Promise<'published'|'conflict'>;

export type AppealableRejection={decision_id:string;profile_id:string;profile_version:number};
export function readBackendAppealableProfileRejection(options:AccountSessionTransportOptions&{id:string}):Promise<AppealableRejection|null>;
export function requestBackendProfessionalProfileAppeal(options:AccountSessionTransportOptions&{id:string;version:number;decisionId:string}):Promise<'submitted'|'conflict'>;
