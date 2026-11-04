const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROOF=/^[A-Za-z0-9_-]{43}$/;
const LIMIT=2048;

export class GuestOtpUnavailable extends Error{
  constructor(){super('Guest OTP temporarily unavailable');}
}

function endpoint(base,suffix,production){
  if(typeof base!=='string'||base.length>500)throw new GuestOtpUnavailable();
  try{
    const url=new URL(base);
    if(!['https:','http:'].includes(url.protocol)||
      (production&&url.protocol!=='https:')||
      url.username||url.password||url.search||url.hash||
      url.pathname.includes('..')||url.pathname.endsWith('//'))
      throw new GuestOtpUnavailable();
    url.pathname=url.pathname.replace(/\/$/,'')+
      '/guest-requests/challenges'+suffix;
    return url.toString();
  }catch{throw new GuestOtpUnavailable();}
}

async function postJson(url,payload,expectedStatus,transport){
  try{
    const response=await transport(url,{
      method:'POST',cache:'no-store',redirect:'manual',credentials:'omit',
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(5000),
    });
    if(response.status!==expectedStatus)throw new GuestOtpUnavailable();
    const type=response.headers.get('content-type')??'';
    if(!/^application\/json(?:\s*;|\s*$)/i.test(type))
      throw new GuestOtpUnavailable();
    const length=response.headers.get('content-length');
    if(length!==null&&(!/^\d+$/.test(length)||Number(length)>LIMIT))
      throw new GuestOtpUnavailable();
    const value=await response.text();
    if(Buffer.byteLength(value,'utf8')>LIMIT)throw new GuestOtpUnavailable();
    return JSON.parse(value);
  }catch{throw new GuestOtpUnavailable();}
}

/**
 * Restricted BFF-to-backend transport only. Never call from browser code.
 * Upstream trusted ingress is responsible for authenticated network budgets,
 * and the future same-origin BFF must enforce CSRF before this operation.
 */
export async function issueGuestOtpChallenge({
  baseUrl,production=false,channel,contact,locale,transport=fetch,
}){
  if(!['email','sms'].includes(channel)||typeof contact!=='string'||
    contact.length<3||contact.length>320||
    !['kk','ru'].includes(locale)||/[\x00-\x1f\x7f]/.test(contact))
    throw new GuestOtpUnavailable();
  const url=endpoint(baseUrl,'',production);
  const data=await postJson(url,{channel,contact,locale},202,transport);
  if(!data||typeof data!=='object'||Array.isArray(data)||
    Object.keys(data).length!==1||typeof data.challenge_id!=='string'||
    !UUID.test(data.challenge_id))throw new GuestOtpUnavailable();
  return {challengeId:data.challenge_id.toLowerCase()};
}

/**
 * Verification returns a bearer CREATE_REQUEST proof. Do not serialize this
 * result to the browser; immediately issue the scoped HttpOnly cookie.
 */
export async function verifyGuestOtpChallenge({
  baseUrl,production=false,challengeId,code,transport=fetch,now=Date.now(),
}){
  if(typeof challengeId!=='string'||!UUID.test(challengeId)||
    typeof code!=='string'||!/^[0-9]{6}$/.test(code)||
    !Number.isSafeInteger(now))throw new GuestOtpUnavailable();
  const url=endpoint(baseUrl,'/'+challengeId.toLowerCase()+'/verify',production);
  const data=await postJson(url,{code},200,transport);
  if(!data||typeof data!=='object'||Array.isArray(data)||
    Object.keys(data).length!==2||
    typeof data.guest_capability!=='string'||!PROOF.test(data.guest_capability)||
    typeof data.expires_at!=='string')throw new GuestOtpUnavailable();
  const expiry=Date.parse(data.expires_at);
  if(!Number.isFinite(expiry)||expiry<=now||expiry>now+900000+5000)
    throw new GuestOtpUnavailable();
  return {createCapability:data.guest_capability,
    expiresInSeconds:Math.min(900,Math.floor((expiry-now)/1000))};
}
