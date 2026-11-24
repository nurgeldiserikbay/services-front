/**
 * Serialize a seller's account-wide decision attempts before React commits
 * its disabled UI state. This is a client-only UX guard; authorization,
 * idempotency and ownership remain exclusively enforced by the backend.
 */
export function createSellerDecisionSingleFlight(){
  let active=false;
  return {
    get active(){return active;},
    async run(operation){
      if(active)return false;
      active=true;
      try{
        await operation();
        return true;
      }finally{
        active=false;
      }
    },
  };
}

/**
 * Allow a completed request to affect only the currently mounted seller inbox.
 * Fetches have separate sequence numbers; a post-decision inbox refresh must
 * not invalidate the lifetime of the decision that triggered it.
 */
export function isCurrentSellerDecision(mounted, capturedLifetime, activeLifetime){
  return mounted===true &&
    Number.isSafeInteger(capturedLifetime) && capturedLifetime>=0 &&
    capturedLifetime===activeLifetime;
}

/** Only the decision owner may reload under a held shared write gate. */
export function sellerRefreshBlocked(active,afterDecision=false){
  return active===true && afterDecision!==true;
}
