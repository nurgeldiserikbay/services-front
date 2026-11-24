export type CustomerCompletionStatus='idle'|'done'|'conflict'|'unavailable';
export function canAttemptCustomerCompletion(status:CustomerCompletionStatus,inFlight:boolean):boolean;
export function readCommittedCustomerCompletionReceipt(response:Response,requestId:string,version:number):Promise<boolean>;
