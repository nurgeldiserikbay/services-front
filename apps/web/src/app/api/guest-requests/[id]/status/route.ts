import {NextRequest,NextResponse} from 'next/server';
import {getPrivateGuestStatus} from '@/lib/guest-status-bff.server';
import {GUEST_REQUEST_COOKIE} from '@/lib/guest-request-access.server';

// Request-scoped status contains private metadata: never cache or index it.
export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';

const PRIVATE_HEADERS={
  'Cache-Control':'private, no-store, max-age=0',
  'Pragma':'no-cache',
  'X-Robots-Tag':'noindex, nofollow',
  'Referrer-Policy':'no-referrer',
  'Vary':'Cookie, Sec-Fetch-Site',
} as const;

function unavailable():NextResponse{
  // Return the same 404 for disabled, unknown, expired and unauthorized IDs.
  return NextResponse.json(
    {code:'NOT_FOUND',message:'Guest request status unavailable'},
    {status:404,headers:PRIVATE_HEADERS},
  );
}

/**
 * This API is disabled by default. It can only expose a small allowlisted
 * status DTO after validating a request-bound HttpOnly READ_CANCEL cookie.
 * Do not pass Guest-Capability through browser-visible headers or URLs.
 *
 * Deployment still requires approved private ingress, audited BFF behavior,
 * OTP delivery, notification and end-to-end release gates.
 */
export async function GET(
  request:NextRequest,
  context:{params:Promise<{id:string}>},
):Promise<NextResponse>{
  if(process.env.SERVICES_WEB_ENABLE_GUEST_STATUS_HTTP!=='enabled')
    return unavailable();
  try{
    const {id}=await context.params;
    const status=await getPrivateGuestStatus({
      requestId:id,
      cookieValue:request.cookies.get(GUEST_REQUEST_COOKIE)?.value,
      fetchSite:request.headers.get('sec-fetch-site'),
    });
    // Explicit allowlist: never serialize the upstream response or cookie.
    return NextResponse.json({
      id:status.id,
      service_offer_id:status.serviceOfferId,
      state:status.state,
      version:status.version,
      created_at:status.createdAt,
    },{status:200,headers:PRIVATE_HEADERS});
  }catch{
    return unavailable();
  }
}
