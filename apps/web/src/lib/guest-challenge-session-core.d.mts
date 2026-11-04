export type GuestChallengeSession=Readonly<{
  challengeId:string;csrf:string;expiresAt:number;
}>;
export function sealGuestChallenge(
  key:Buffer,challengeId:string,ttlSeconds?:number,now?:number,
):{cookie:string;csrf:string;expiresAt:number};
export function openGuestChallenge(
  key:Buffer,cookie:string|undefined,now?:number,
):GuestChallengeSession|null;
export function verifyGuestChallengeSession(
  session:GuestChallengeSession|null,challengeId:unknown,csrfToken:unknown,
):boolean;
