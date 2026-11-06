const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR=/^[A-Za-z0-9_-]{1,256}$/;
const CSRF=/^[A-Za-z0-9_-]{43}$/;
const STATES=new Set(['pending','accepted','declined','cancelled_by_customer',
 'cancelled_by_provider','cancelled_mutual','completed','expired']);
export const MAX_SELLER_DECISION_BYTES=1024;
export function parseSellerInboxQuery(url){
 const params=new URL(url).searchParams;
 if([...params.keys()].some(k=>!['state','cursor','limit'].includes(k))||
    [...new Set(params.keys())].some(k=>params.getAll(k).length!==1))
   return null;
 const limit=params.get('limit')??'20';
 const state=params.get('state');
 const cursor=params.get('cursor');
 if(!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)||
    (state!==null&&!STATES.has(state))||
    (cursor!==null&&!CURSOR.test(cursor)))return null;
 return {limit:Number(limit),state,cursor};
}
export function parseSellerDecisionPayload(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const keys=Object.keys(value).sort();
 if(keys.join(',')!=='csrf_token,idempotency_key,version'||
    !Number.isSafeInteger(value.version)||value.version<1||
    value.version>9999999999||
    typeof value.csrf_token!=='string'||!CSRF.test(value.csrf_token)||
    typeof value.idempotency_key!=='string'||!UUID.test(value.idempotency_key))
   return null;
 return {version:value.version,csrfToken:value.csrf_token,
   idempotencyKey:value.idempotency_key.toLowerCase()};
}
export async function readSellerDecisionBytes(stream){
 if(!stream)throw new Error('invalid_body');
 const reader=stream.getReader();
 const chunks=[];let size=0;
 try{
   while(true){
     const {done,value}=await reader.read();
     if(done)break;
     size+=value.byteLength;
     if(size>MAX_SELLER_DECISION_BYTES)throw new Error('too_large');
     chunks.push(value);
   }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return bytes;
}
export function parseSellerDecisionBytes(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_SELLER_DECISION_BYTES)
   return null;
 try{return parseSellerDecisionPayload(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}
 catch{return null;}
}
export function sellerBffSameOrigin(fetchSite){
 return fetchSite===null||fetchSite==='same-origin'||fetchSite==='none';
}
