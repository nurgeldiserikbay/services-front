const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Safe optimistic-concurrency request metadata; never contains bearer tokens. */
export function buildSellerDecisionRequest(requestId,action,version,key){
  if(typeof requestId!=='string'||!UUID.test(requestId)||
     !['accept','decline'].includes(action)||
     !Number.isSafeInteger(version)||version<1||version>=Number.MAX_SAFE_INTEGER||
     typeof key!=='string'||!UUID.test(key))
    throw new Error('invalid_seller_decision');
  return {
    path:'/v1/requests/'+requestId.toLowerCase()+'/'+action,
    headers:{'If-Match':'"'+version+'"','Idempotency-Key':key.toLowerCase()},
  };
}

/** Validate the exact backend decision receipt before updating UI state. */
export function parseSellerDecisionReceipt(value,requestId,action,expectedVersion){
  if(typeof requestId!=='string'||!UUID.test(requestId)||
     (action!=='accept'&&action!=='decline')||
     !Number.isSafeInteger(expectedVersion)||expectedVersion<1||
     expectedVersion>=Number.MAX_SAFE_INTEGER||
     !value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).length!==4||
     Object.keys(value).some(k=>!['id','state','version','replayed'].includes(k))||
     typeof value.id!=='string'||!UUID.test(value.id)||
     value.id.toLowerCase()!==requestId.toLowerCase()||
     value.state!==(action==='accept'?'accepted':'declined')||
     !Number.isSafeInteger(value.version)||value.version!==expectedVersion+1||
     typeof value.replayed!=='boolean')
    throw new Error('invalid_seller_decision_receipt');
  return {id:value.id.toLowerCase(),state:value.state,version:value.version,replayed:value.replayed};
}

/** Reuse a retry key only for the exact same decision context. */
export function nextSellerDecisionAttempt(previous,requestId,version,action,newKey){
  if(typeof requestId!=='string'||!UUID.test(requestId)||
     !Number.isSafeInteger(version)||version<1||version>=Number.MAX_SAFE_INTEGER||
     !['accept','decline'].includes(action)||
     typeof newKey!=='string'||!UUID.test(newKey))
    throw new Error('invalid_seller_decision');
  if(typeof previous?.requestId==='string'&&UUID.test(previous.requestId)&&
     previous.requestId.toLowerCase()===requestId.toLowerCase()&&
     previous.version===version&&previous.action===action&&
     typeof previous.key==='string'&&UUID.test(previous.key))
    return previous;
  return {requestId,version,action,key:newKey};
}

/** A response is usable only for the same mounted request context. */
export function isCurrentSellerDecisionResponse(attemptGeneration,currentGeneration,
  attemptedRequestId,currentRequestId,attemptedVersion,currentVersion){
  return Number.isSafeInteger(attemptGeneration)&&attemptGeneration>=0&&
    Number.isSafeInteger(currentGeneration)&&currentGeneration>=0&&
    typeof attemptedRequestId==='string'&&UUID.test(attemptedRequestId)&&
    attemptGeneration===currentGeneration&&
    attemptedRequestId===currentRequestId&&
    Number.isSafeInteger(attemptedVersion)&&attemptedVersion>=1&&
    attemptedVersion<Number.MAX_SAFE_INTEGER&&attemptedVersion===currentVersion;
}
