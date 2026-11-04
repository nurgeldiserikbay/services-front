/** Only an actual committed backend response may become a visible receipt. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type CreatedGuestReceipt=Readonly<{id:string;state:'pending'}>;
export function parseCommittedCreateReceipt(value:unknown):CreatedGuestReceipt|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const o=value as Record<string,unknown>;
  if(typeof o.id!=='string'||!UUID.test(o.id)||o.state!=='pending')return null;
  // Allow the adapter to add harmless metadata, but never propagate it to UI.
  return {id:o.id.toLowerCase(),state:'pending'};
}
