import {timingSafeEqual} from 'node:crypto';
const CANONICAL=/^[A-Za-z0-9+/]{43}=$/;
const REQUIRED=['preauth','challenge','session','privateBff'];
/**
 * Fail closed before sending a one-use OTP. A delivered challenge is not
 * useful if the web session key will fail after the backend consumes its code.
 *
 * Each security domain must have a distinct 256-bit secret. Strict
 * canonical base64 disallows alternative encodings of the same key.
 * Never include the name or value of a misconfigured key in public errors.
 */
export function requireAccountOtpCompletionKeys(values){
 if(!values||typeof values!=='object'||Array.isArray(values)||
    Object.keys(values).sort().join(',')!==
    'challenge,preauth,privateBff,session')
  throw new Error('account_otp_config_unavailable');
 const keys=[];
 for(const name of REQUIRED){
  const value=values[name];
  if(typeof value!=='string'||!CANONICAL.test(value))
   throw new Error('account_otp_config_unavailable');
  const key=Buffer.from(value,'base64');
  if(key.length!==32||key.toString('base64')!==value)
   throw new Error('account_otp_config_unavailable');
  for(const previous of keys){
   if(timingSafeEqual(key,previous))
    throw new Error('account_otp_config_unavailable');
  }
  keys.push(key);
 }
 return true;
}
