/** Rejects stalled actions while leaving server mutation outcome uncertain. */
export function withSellerDecisionDeadline<T>(operation:()=>Promise<T>|T,timeoutMs?:number):Promise<T>;
