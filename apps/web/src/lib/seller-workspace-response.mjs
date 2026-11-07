export const MAX_SELLER_UI_RESPONSE_BYTES=65536;
const JSON_CONTENT=/^application\/json(?:\s*;|\s*$)/i;

/**
 * Read only a bounded same-origin BFF JSON response. Never trust the
 * Content-Length header alone or forward raw upstream error bodies.
 */
export async function readBoundedSellerUiJson(response,{maxBytes=MAX_SELLER_UI_RESPONSE_BYTES}={}){
 if(!response||response.status!==200||
    !JSON_CONTENT.test(response.headers.get('content-type')??'')||
    !Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_SELLER_UI_RESPONSE_BYTES)
  throw new Error('seller_response_unavailable');
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))
  throw new Error('seller_response_unavailable');
 const reader=response.body?.getReader();
 if(!reader)throw new Error('seller_response_unavailable');
 const chunks=[];
 let count=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   count+=value.byteLength;
   if(count>maxBytes)throw new Error('seller_response_unavailable');
   chunks.push(value);
  }
 }catch{await reader.cancel().catch(()=>{});throw new Error('seller_response_unavailable');}
 finally{reader.releaseLock();}
 const result=new Uint8Array(count);
 let offset=0;
 for(const part of chunks){result.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result));}
 catch{throw new Error('seller_response_unavailable');}
}
export function parseSellerDecisionUiAck(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length!==1||value.outcome!=='ok')
  throw new Error('seller_response_unavailable');
 return 'ok';
}
