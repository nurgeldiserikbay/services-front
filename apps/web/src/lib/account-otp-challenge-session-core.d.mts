export const ACCOUNT_OTP_CHALLENGE_MAX_TTL_SECONDS:300;
export type AccountOtpChallengeSession={
 challengeId:string;channel:'EMAIL'|'SMS';csrf:string;expiresAt:number;
};
export function sealAccountOtpChallenge(
 key:Buffer,challengeId:string,channel:'EMAIL'|'SMS',
 ttlSeconds?:number,now?:number,
):{cookie:string;csrf:string;expiresAt:number};
export function openAccountOtpChallenge(
 key:Buffer,cookie:unknown,now?:number,
):AccountOtpChallengeSession|null;
export function verifyAccountOtpChallenge(
 session:AccountOtpChallengeSession|null,challengeId:string,
 channel:'EMAIL'|'SMS',csrf:unknown,
):boolean;
