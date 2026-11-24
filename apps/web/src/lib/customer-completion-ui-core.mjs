/** A completion POST may commit before an HTTP timeout or disconnect.
 * Only a fresh server-rendered request version may authorize a new attempt.
 */
export function canAttemptCustomerCompletion(status,inFlight){
 return status==='idle'&&inFlight===false;
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_RECEIPT_BYTES=512;

/** Only an exact, private, committed receipt authorizes a success message.
 * Any malformed or uncertain acknowledgement requires a fresh owner inventory.
 */
export async function readCommittedCustomerCompletionReceipt(response,requestId,version){
 if(!response||response.status!==200||
  typeof requestId!=='string'||!UUID.test(requestId)||
  !Number.isSafeInteger(version)||version<1||version>=2147483647||
  response.headers?.has('content-range')||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
   response.headers?.get('content-type')??'')||
  !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(
   response.headers?.get('cache-control')??''))
  return false;
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
  Number(length)>MAX_RECEIPT_BYTES))return false;
 if(!response.body)return false;
 const reader=response.body.getReader();
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let bytes=0,raw='',complete=false;
 try{
  for(;;){
   const chunk=await reader.read();
   if(chunk.done){complete=true;break;}
   if(!(chunk.value instanceof Uint8Array))return false;
   bytes+=chunk.value.byteLength;
   if(bytes>MAX_RECEIPT_BYTES)return false;
   raw+=decoder.decode(chunk.value,{stream:true});
  }
  raw+=decoder.decode();
  const receipt=JSON.parse(raw);
  return !!receipt&&typeof receipt==='object'&&!Array.isArray(receipt)&&
   Object.keys(receipt).sort().join(',')==='code,id,version'&&
   receipt.code==='COMPLETED'&&receipt.id===requestId&&
   receipt.version===version+1;
 }catch{return false;}
 finally{
  if(!complete)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
