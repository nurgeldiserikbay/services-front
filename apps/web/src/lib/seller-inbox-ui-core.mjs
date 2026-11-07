const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES=new Set(['pending','accepted','declined','cancelled_by_customer',
  'cancelled_by_provider','cancelled_mutual','completed','expired']);
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const validDate=x=>typeof x==='string'&&ISO.test(x)&&
  Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const validUuid=x=>typeof x==='string'&&UUID.test(x);

/** Parse only public-safe seller inbox fields; no contact or notes allowed. */
export function parseSellerInboxPage(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(k=>!['items','next_cursor'].includes(k))||
    !Array.isArray(value.items)||value.items.length>50||
    !(value.next_cursor===null||
      (typeof value.next_cursor==='string'&&
       /^[A-Za-z0-9_-]{1,256}$/.test(value.next_cursor))))
    throw new Error('seller_inbox_unavailable');
  const items=value.items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||
      Object.keys(item).length!==9||
      Object.keys(item).some(k=>!['id','service_offer_id','title','state','version',
        'seller_kind','seller_id','created_at','scheduled_start_at'].includes(k))||
      !validUuid(item.id)||!validUuid(item.service_offer_id)||!validUuid(item.seller_id)||
      typeof item.title!=='string'||item.title.length>500||
      !STATES.has(item.state)||!Number.isSafeInteger(item.version)||item.version<1||
      !['professional','organization'].includes(item.seller_kind)||
      !validDate(item.created_at)||
      !(item.scheduled_start_at===null||validDate(item.scheduled_start_at)))
      throw new Error('seller_inbox_unavailable');
    return {...item};
  });
  return {items,next_cursor:value.next_cursor};
}
