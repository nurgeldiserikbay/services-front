import type {ScheduleProposalBody} from './account-session-transport.mjs';
export function buildScheduleProposal(start:string,end:string,timezone:string,offsetMinutes:number):ScheduleProposalBody|null;
export function readScheduleProposalReceipt(response:Response,id:string,version:number,body:ScheduleProposalBody):Promise<boolean>;
