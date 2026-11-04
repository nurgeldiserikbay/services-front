const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export const GUEST_CREATE_MAX_BODY_BYTES=2048;

export function validateGuestCreateRouteBody(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new Error('invalid_create_payload');
  const value=raw;
  if(Object.keys(value).some(key=>![
    'csrf_token','idempotency_key','service_offer_id',
    'consent_to_contact','note',
  ].includes(key))||
    typeof value.csrf_token!=='string'||!TOKEN.test(value.csrf_token)||
    typeof value.idempotency_key!=='string'||!KEY.test(value.idempotency_key)||
    typeof value.service_offer_id!=='string'||!UUID.test(value.service_offer_id)||
    value.consent_to_contact!==true||
    (value.note!==undefined&&
      (typeof value.note!=='string'||value.note.length>1000||
       /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.note))))
    throw new Error('invalid_create_payload');
  return {
    csrfToken:value.csrf_token,
    idempotencyKey:value.idempotency_key,
    body:{
      service_offer_id:value.service_offer_id.toLowerCase(),
      consent_to_contact:true,
      ...(value.note===undefined?{}:{note:value.note.trim()}),
    },
  };
}

export function parseGuestCreateRequestBytes(bytes){
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>GUEST_CREATE_MAX_BODY_BYTES)
    throw new Error('invalid_create_payload');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  return validateGuestCreateRouteBody(JSON.parse(text));
}
