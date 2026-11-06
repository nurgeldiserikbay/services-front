import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getOwnSellerInbox} from '@/lib/seller-bff.server';
import {parseSellerInboxQuery,sellerBffSameOrigin}
 from '@/lib/seller-bff-route-core.mjs';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
const reject=(status:400|404|503)=>NextResponse.json(
 {code:status===400?'INVALID_REQUEST':'UNAVAILABLE'},
 {status,headers:HEADERS});

/**
 * Disabled by default until vetted registered-account session issuance exists.
 * The backend—not the browser—authorizes all returned seller requests.
 */
export async function GET(request:NextRequest):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_SELLER_BFF!=='enabled')return reject(404);
 if(!sellerBffSameOrigin(request.headers.get('sec-fetch-site')))return reject(404);
 const query=parseSellerInboxQuery(request.url);
 if(!query)return reject(400);
 try{
   const page=await getOwnSellerInbox(
     request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,query);
   return NextResponse.json(page,{status:200,headers:HEADERS});
 }catch{return reject(503);}
}
