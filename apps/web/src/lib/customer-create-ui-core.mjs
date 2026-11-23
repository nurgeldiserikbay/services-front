const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_RECEIPT_BYTES=512;

/**
 * A browser-visible receipt is proof of a committed creation only after
 * strict status/header/payload validation. Never read arbitrary backend data.
 */
export async function readCommittedCustomerCreateReceipt(response){
 if(!response||response.status!==201||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
   response.headers?.get('content-type')??'')||
  !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(
   response.headers?.get('cache-control')??'')||
  response.headers?.has('content-range'))
  return null;
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
  Number(length)>MAX_RECEIPT_BYTES))return null;
 if(!response.body)return null;
 const reader=response.body.getReader();
 let count=0,complete=false;
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let raw='';
 try{
  while(true){
   const part=await reader.read();
   if(part.done){complete=true;break;}
   if(!(part.value instanceof Uint8Array))return null;
   count+=part.value.byteLength;
   if(count>MAX_RECEIPT_BYTES)return null;
   raw+=decoder.decode(part.value,{stream:true});
  }
  raw+=decoder.decode();
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
   Object.keys(parsed).sort().join(',')!=='code,id,version'||
   parsed.code!=='CREATED'||typeof parsed.id!=='string'||
   !UUID.test(parsed.id)||parsed.version!==1)return null;
  return {id:parsed.id,version:1};
 }catch{return null;}
 finally{
  if(!complete)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
