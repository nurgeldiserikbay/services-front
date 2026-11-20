export function guestCompletionUrl(requestId:string,suffix?:string):string;
export function shouldResetGuestCompletionAfterVerifiedRefresh(
 previousVersion:number|null,nextVersion:number,nextState:string
):boolean;
export function readGuestCompletionUiResponse(
 response:Response,kind:'bootstrap'|'challenge'|'verify'|'confirm',
 requestId?:string,version?:number
):Promise<{
 csrfToken?:string;challengeId?:string;verified?:boolean;
 completed?:boolean;version?:number;
}>;
