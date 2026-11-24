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
