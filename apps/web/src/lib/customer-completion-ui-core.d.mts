export type CustomerCompletionStatus='idle'|'done'|'conflict'|'unavailable';
export function canAttemptCustomerCompletion(status:CustomerCompletionStatus,inFlight:boolean):boolean;
