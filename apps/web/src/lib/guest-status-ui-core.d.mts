export const MAX_STATUS_BYTES:number;
export type PrivateGuestStatusState=
  'pending'|'accepted'|'declined'|'completed'|'expired'|
  'cancelled_by_customer'|'cancelled_by_provider'|'cancelled_mutual';
export type PrivateGuestStatus=Readonly<{
  id:string;state:PrivateGuestStatusState;version:number;createdAt:string;
}>;
export function parsePrivateGuestStatus(
  value:unknown,expectedRequestId:string,expectedOfferId:string,
):PrivateGuestStatus;
export function privateGuestStatusUrl(id:string):string;
export function readPrivateGuestStatusResponse(
  response:Response,expectedId:string,expectedOfferId:string,
):Promise<PrivateGuestStatus>;

/** A strictly newer valid backend version replaces the currently displayed one. */
export function shouldReplaceGuestStatus(
  currentVersion:number|null,nextVersion:number,
):boolean;
