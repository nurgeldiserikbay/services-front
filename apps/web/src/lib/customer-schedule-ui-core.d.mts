import type {ScheduleProposalBody} from './account-session-transport.mjs';
export function buildScheduleProposal(start:string,end:string,timezone:string,offsetMinutes:number):ScheduleProposalBody|null;
export function readScheduleProposalReceipt(response:Response,id:string,version:number,body:ScheduleProposalBody,actor?:'customer'|'seller'):Promise<boolean>;

import type {ActiveScheduleView} from './account-session-transport.mjs';
export function readScheduleResolutionReceipt(response:Response,view:ActiveScheduleView,action:'confirm'|'decline'):Promise<boolean>;
