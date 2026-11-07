const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Safe optimistic-concurrency request metadata; never contains bearer tokens. */
export function buildSellerDecisionRequest(requestId,action,version,key){
  if(typeof requestId!=='string'||!UUID.test(requestId)||
     !['accept','decline'].includes(action)||
     !Number.isSafeInteger(version)||version<1||
     typeof key!=='string'||!UUID.test(key))
    throw new Error('invalid_seller_decision');
  return {
    path:'/v1/requests/'+requestId.toLowerCase()+'/'+action,
    headers:{'If-Match':'"'+version+'"','Idempotency-Key':key.toLowerCase()},
  };
}
