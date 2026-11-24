export interface SellerDecisionSingleFlight {
  readonly active:boolean;
  run(operation:()=>Promise<void>):Promise<boolean>;
}
export function createSellerDecisionSingleFlight():SellerDecisionSingleFlight;

export function isCurrentSellerDecision(mounted:boolean,capturedLifetime:number,activeLifetime:number):boolean;

export function sellerRefreshBlocked(active:boolean,afterDecision?:boolean):boolean;
