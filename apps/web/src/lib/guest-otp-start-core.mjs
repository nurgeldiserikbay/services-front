export const MAX_OTP_START_BODY_BYTES=512;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export function validateOtpStartInput(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).length!==4||
    Object.keys(raw).some(k=>!['channel','contact','locale','csrf_token'].includes(k))||
    !['sms','email'].includes(raw.channel)||
    typeof raw.contact!=='string'||raw.contact.length>320||
    !['kk','ru'].includes(raw.locale)||
    typeof raw.csrf_token!=='string'||!TOKEN.test(raw.csrf_token))
    throw new Error('otp_start_invalid');
  if(raw.channel==='sms'){
    if(!/^\+[1-9][0-9]{7,14}$/.test(raw.contact))
      throw new Error('otp_start_invalid');
  }else{
    if(raw.contact.length<3||/[\s\x00-\x1f\x7f]/.test(raw.contact)||
       !/^[^@]+@[^@]+\.[^@]+$/.test(raw.contact))
      throw new Error('otp_start_invalid');
  }
  return {channel:raw.channel,contact:raw.contact,locale:raw.locale,
    csrfToken:raw.csrf_token};
}
export async function readOtpStartBody(stream){
  if(!stream||typeof stream.getReader!=='function')
    throw new Error('otp_start_invalid');
  const reader=stream.getReader();let total=0,finished=false;
  const chunks=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done){finished=true;break;}
      if(!(value instanceof Uint8Array)||total+value.byteLength>MAX_OTP_START_BODY_BYTES)
        throw new Error('otp_start_invalid');
      chunks.push(value);total+=value.byteLength;
    }
  }finally{
    if(!finished)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  const bytes=new Uint8Array(total);let offset=0;
  for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  return validateOtpStartInput(JSON.parse(
    new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
