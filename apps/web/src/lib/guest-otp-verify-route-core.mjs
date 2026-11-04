const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export const MAX_OTP_VERIFY_BODY=512;

export function parseGuestOtpVerifyBody(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).length!==3||
    Object.keys(raw).some(k=>!['challenge_id','csrf_token','code'].includes(k))||
    typeof raw.challenge_id!=='string'||!UUID.test(raw.challenge_id)||
    typeof raw.csrf_token!=='string'||!TOKEN.test(raw.csrf_token)||
    typeof raw.code!=='string'||!/^[0-9]{6}$/.test(raw.code))
    throw new Error('invalid_otp_verify_payload');
  return {challengeId:raw.challenge_id.toLowerCase(),csrfToken:raw.csrf_token,code:raw.code};
}

/** Bound stream reads before decoding to avoid accepting oversized chunked POST. */
export async function readGuestOtpVerifyBody(stream){
  if(!stream||typeof stream.getReader!=='function')
    throw new Error('invalid_otp_verify_payload');
  const reader=stream.getReader();
  let count=0;
  const buffers=[];
  let finished=false;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done){finished=true;break;}
      if(!(value instanceof Uint8Array)||count+value.byteLength>MAX_OTP_VERIFY_BODY)
        throw new Error('invalid_otp_verify_payload');
      count+=value.byteLength;
      buffers.push(value);
    }
  }finally{
    if(!finished)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  const bytes=new Uint8Array(count);
  let offset=0;
  for(const chunk of buffers){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return parseGuestOtpVerifyBody(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
