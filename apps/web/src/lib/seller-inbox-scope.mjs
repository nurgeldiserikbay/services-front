const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIND=new Set(['professional','organization']);

/**
 * Check seller ownership context on the complete wire page BEFORE projecting
 * it to the UI. Backend ACL is still mandatory; this is defense-in-depth.
 * Fail closed on any mixed-context row instead of silently filtering.
 */
export function assertSellerInboxScope(raw,{sellerKind,sellerId}){
  if(!KIND.has(sellerKind)||typeof sellerId!=='string'||!UUID.test(sellerId)||
     !raw||typeof raw!=='object'||Array.isArray(raw)||
     !Array.isArray(raw.items)||raw.items.length>50)
    throw new Error('Invalid seller inbox scope');
  for(const item of raw.items){
    if(!item||typeof item!=='object'||Array.isArray(item)||
       item.seller_kind!==sellerKind||
       typeof item.seller_id!=='string'||!UUID.test(item.seller_id)||
       item.seller_id.toLowerCase()!==sellerId.toLowerCase())
      throw new Error('Invalid seller inbox scope');
  }
  return raw;
}
