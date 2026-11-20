const MIME=/^application\/json(?:\s*;\s*charset=utf-8)?$/i;
export class InvalidGuestCompletionBody extends Error{
 constructor(){super('invalid_guest_completion_body');}
}
export async function readGuestCompletionBody(request,maxBytes=128){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<2||maxBytes>512||
  !MIME.test(request.headers.get('content-type')??'')||
  request.headers.has('content-encoding')||!request.body)
  throw new InvalidGuestCompletionBody();
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||
  Number(length)>maxBytes))throw new InvalidGuestCompletionBody();
 const reader=request.body.getReader();const chunks=[];
 let lengthRead=0,ended=false;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done){ended=true;break;}
   if(!(value instanceof Uint8Array)||lengthRead+value.byteLength>maxBytes)
    throw new InvalidGuestCompletionBody();
   lengthRead+=value.byteLength;chunks.push(value);
  }
  const all=new Uint8Array(lengthRead);
  let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(all);
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
   Object.getPrototypeOf(parsed)!==Object.prototype)
   throw new InvalidGuestCompletionBody();
  return parsed;
 }catch{throw new InvalidGuestCompletionBody();}
 finally{
  if(!ended)try{void reader.cancel().catch(()=>{});}catch{}
  reader.releaseLock();
 }
}
