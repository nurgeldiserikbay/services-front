const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF=/^[A-Za-z0-9_-]{43}$/;
const LIMIT=1024;
export function guestCompletionUrl(requestId,suffix=''){
 if(typeof requestId!=='string'||!UUID.test(requestId)||
    !['/bootstrap','/challenges','/confirm'].includes(suffix)&&
    !/^\/challenges\/[0-9a-f-]{36}\/verify$/i.test(suffix))
  throw new Error('guest_completion_invalid_url');
 return '/api/guest-requests/'+requestId.toLowerCase()+'/completion'+suffix;
}
export async function readGuestCompletionUiResponse(response,kind,requestId,version){
 if(!response||!Number.isSafeInteger(response.status)||
    response.status!==(kind==='bootstrap'||kind==='verify'||kind==='confirm'?200:202)||
    response.headers.get('set-cookie')!==null||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      response.headers.get('content-type')??'')||
    !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(
      response.headers.get('cache-control')??''))
  throw new Error('guest_completion_unavailable');
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||Number(length)>LIMIT))
  throw new Error('guest_completion_unavailable');
 if(!response.body)throw new Error('guest_completion_unavailable');
 const reader=response.body.getReader();
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let raw='',size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>LIMIT)throw new Error('guest_completion_unavailable');
   raw+=decoder.decode(value,{stream:true});
  }
  raw+=decoder.decode();
 }finally{reader.releaseLock();}
 let data;
 try{data=JSON.parse(raw);}catch{throw new Error('guest_completion_unavailable');}
 if(!data||typeof data!=='object'||Array.isArray(data))
  throw new Error('guest_completion_unavailable');
 const keys=Object.keys(data).sort().join(',');
 if(kind==='bootstrap'&&keys==='csrf_token'&&CSRF.test(data.csrf_token))
  return {csrfToken:data.csrf_token};
 if(kind==='challenge'&&keys==='challenge_id'&&UUID.test(data.challenge_id))
  return {challengeId:data.challenge_id.toLowerCase()};
 if(kind==='verify'&&keys==='verified'&&data.verified===true)
  return {verified:true};
 if(kind==='confirm'&&keys==='code,id,version'&&data.code==='COMPLETED'&&
    typeof requestId==='string'&&data.id===requestId.toLowerCase()&&
    Number.isSafeInteger(version)&&data.version===version+1)
  return {completed:true,version:data.version};
 throw new Error('guest_completion_unavailable');
}

/**
 * Only a verified, same-version ACCEPTED refresh can release an ambiguous
 * guest completion UI. A stale response, failed refresh or a newer version
 * must not restore old one-use credentials or re-submit a COMMIT.
 */
export function shouldResetGuestCompletionAfterVerifiedRefresh(
 previousVersion,nextVersion,nextState){
 return Number.isSafeInteger(previousVersion)&&previousVersion>=1&&
  Number.isSafeInteger(nextVersion)&&nextVersion===previousVersion&&
  nextState==='accepted';
}
