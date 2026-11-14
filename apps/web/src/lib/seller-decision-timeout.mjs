/** Reject stalled seller actions without cancelling the underlying server mutation.
 * The caller must retain its idempotency key for any retry.
 */
export async function withSellerDecisionDeadline(operation,timeoutMs=15_000){
  if(typeof operation!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)
    throw new Error('invalid_seller_decision_deadline');
  let deadline;
  try{
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_,reject)=>{
        deadline=setTimeout(()=>reject(new Error('seller_decision_timeout')),timeoutMs);
      }),
    ]);
  }finally{
    if(deadline!==undefined)clearTimeout(deadline);
  }
}
