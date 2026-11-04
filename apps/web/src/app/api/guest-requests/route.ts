import {NextRequest,NextResponse} from 'next/server';
import {submitVerifiedGuestRequest} from '@/lib/guest-create-bff.server';
import {GUEST_CREATE_COOKIE} from '@/lib/guest-session.server';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';

import {parseGuestCreateRequestBytes,GUEST_CREATE_MAX_BODY_BYTES}
  from '@/lib/guest-create-route-core.mjs';
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
      Number(declared)>GUEST_CREATE_MAX_BODY_BYTES))return unavailable(503);
    // Byte limit applies even to chunked requests without Content-Length.
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength>GUEST_CREATE_MAX_BODY_BYTES)return unavailable(503);
    const parsed=parseGuestCreateRequestBytes(bytes);
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
