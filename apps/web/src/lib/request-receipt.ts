/**
 * Private receipt contract: render ONLY a committed backend response.
 * A client-side inquiry draft or successful OTP verification is not a receipt.
 */
export type RequestReceipt=Readonly<{
  id:string;
  state:'pending'|'accepted'|'declined'|'completed'|'expired'|
    'cancelled_by_customer'|'cancelled_by_provider'|'cancelled_mutual';
  serviceOfferId:string;
  version:number;
}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states=new Set(['pending','accepted','declined','completed','expired',
  'cancelled_by_customer','cancelled_by_provider','cancelled_mutual']);
export function parseCommittedReceipt(value:unknown):RequestReceipt|null {
  if(!value || typeof value!=='object'||Array.isArray(value))return null;
  const o=value as Record<string,unknown>;
  if(typeof o.id!=='string'||!UUID.test(o.id)||
    typeof o.serviceOfferId!=='string'||!UUID.test(o.serviceOfferId)||
    typeof o.state!=='string'||!states.has(o.state)||
    typeof o.version!=='number'||!Number.isSafeInteger(o.version)||o.version<1)return null;
  return {id:o.id,state:o.state as RequestReceipt['state'],
    serviceOfferId:o.serviceOfferId,version:o.version};
}
