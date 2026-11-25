const RESPONSES={
 edit:{status:200,code:'UPDATED'},
 publish:{status:201,code:'PUBLISHED'},
 appeal:{status:201,code:'SUBMITTED'},
};
const MAX_BYTES=128;

/** BFF mutation acknowledgements are intentionally code-only and private.
 * An ambiguous HTTP response may follow a committed upstream operation.
 */
export async function confirmedProfileMutation(response,operation){
 const expected=Object.hasOwn(RESPONSES,operation)?RESPONSES[operation]:null;
 if(!expected||!response||response.status!==expected.status||
  response.headers?.has('content-range')||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
   response.headers?.get('content-type')??''))
  return false;
 const cache=response.headers.get('cache-control')??'';
 if(!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)||
  /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(cache))return false;
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
  Number(length)>MAX_BYTES))return false;
 if(!response.body)return false;
 const reader=response.body.getReader();
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let size=0,raw='',done=false;
 try{
  while(true){
   const part=await reader.read();
   if(part.done){done=true;break;}
   if(!(part.value instanceof Uint8Array))return false;
   size+=part.value.byteLength;
   if(size>MAX_BYTES)return false;
   raw+=decoder.decode(part.value,{stream:true});
  }
  raw+=decoder.decode();
  const parsed=JSON.parse(raw);
  return !!parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&
   Object.keys(parsed).join(',')==='code'&&parsed.code===expected.code;
 }catch{return false;}
 finally{
  if(!done)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
