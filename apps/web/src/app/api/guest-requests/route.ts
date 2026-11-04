import {NextRequest,NextResponse} from 'next/server';
import {submitVerifiedGuestRequest} from '@/lib/guest-create-bff.server';
import {GUEST_CREATE_COOKIE} from '@/lib/guest-session.server';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';

const MAX_BODY_BYTES=2048;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESPONSE_HEADERS={
  'Cache-Control':'private, no-store, max-age=0',
  'Pragma':'no-cache',
  'X-Robots-Tag':'noindex, nofollow',
  'Referrer-Policy':'no-referrer',
  'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;

function unavailable(status:404|503):NextResponse{
  return NextResponse.json(
    {code:'UNAVAILABLE',message:'Guest request temporarily unavailable'},
    {status,headers:RESPONSE_HEADERS},
  );
}

function validateInput(raw:unknown):{
  csrfToken:string;idempotencyKey:string;
  body:{service_offer_id:string;note?:string;consent_to_contact:true};
}{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new Error('invalid_create_payload');
  const value=raw as Record<string,unknown>;
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
      ...(value.note===undefined?{}:{note:(value.note as string).trim()}),
    },
  };
}

/**
 * Default-off BFF endpoint. CREATE_REQUEST and READ_CANCEL capabilities
 * are never serialized or placed in browser-visible headers.
 * Replays MUST keep the same idempotency key: the backend owns atomicity.
 * The route intentionally does not mount the guest wizard publicly.
 */
export async function POST(request:NextRequest):Promise<NextResponse>{
  if(process.env.SERVICES_WEB_ENABLE_GUEST_CREATE_HTTP!=='enabled')
    return unavailable(404);
  try{
    if(!/^application\/json(?:\s*;|\s*$)/i.test(
      request.headers.get('content-type')??'',
    ))return unavailable(503);
    const declared=request.headers.get('content-length');
    if(declared!==null&&(!/^\d+$/.test(declared)||
      Number(declared)>MAX_BODY_BYTES))return unavailable(503);
    // Byte limit applies even to chunked requests without Content-Length.
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength>MAX_BODY_BYTES)return unavailable(503);
    const parsed=validateInput(JSON.parse(
      new TextDecoder('utf-8',{fatal:true}).decode(bytes),
    ));
    const created=await submitVerifiedGuestRequest({
      cookieValue:request.cookies.get(GUEST_CREATE_COOKIE)?.value,
      csrfToken:parsed.csrfToken,
      origin:request.headers.get('origin'),
      fetchSite:request.headers.get('sec-fetch-site'),
      idempotencyKey:parsed.idempotencyKey,
      body:parsed.body,
    });
    // Explicit response allowlist. Never serialize the BFF result wholesale.
    const response=NextResponse.json(
      {id:created.receipt.id,state:created.receipt.state},
      {status:201,headers:RESPONSE_HEADERS},
    );
    response.cookies.set(created.setCookie.name,created.setCookie.value,
      created.setCookie.options);
    response.cookies.set(created.clearCookie.name,created.clearCookie.value,
      created.clearCookie.options);
    return response;
  }catch{
    // Preserve CREATE_REQUEST cookie for retry with SAME idempotency key,
    // even when the backend committed but the network response was lost.
    return unavailable(503);
  }
}
