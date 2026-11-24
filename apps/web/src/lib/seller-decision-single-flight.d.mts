export interface SellerDecisionSingleFlight {
  readonly active:boolean;
  run(operation:()=>Promise<void>):Promise<boolean>;
}
export function createSellerDecisionSingleFlight():SellerDecisionSingleFlight;
