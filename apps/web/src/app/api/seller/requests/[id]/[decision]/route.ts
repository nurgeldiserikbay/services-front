import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {decideOwnSellerRequest} from '@/lib/seller-bff.server';
import {parseSellerDecisionBytes,readSellerDecisionBytes,sellerBffSameOrigin,
 MAX_SELLER_DECISION_BYTES} from '@/lib/seller-bff-route-core.mjs';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS={
 'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
 'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
function error(status:400|401|404|409|403|503){
 return NextResponse.json({code:status===409?'CONFLICT':
   status===403?'FORBIDDEN':status===401?'AUTH_REQUIRED':status===400?'INVALID_REQUEST':'UNAVAILABLE'},
   {status,headers:HEADERS});
}
/** Default-off. Backend remains authoritative for account and seller ACL. */
export async function POST(
 request:NextRequest,
 context:{params:Promise<{id:string;decision:string}>},
):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_SELLER_BFF!=='enabled')return error(404);
 if(!sellerBffSameOrigin(request.headers.get('sec-fetch-site')))return error(403);
 try{
   const {id,decision}=await context.params;
   if(!UUID.test(id)||(decision!=='accept'&&decision!=='decline')||
      new URL(request.url).search!=='')return error(400);
   if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')??''))
     return error(400);
   const length=request.headers.get('content-length');
   if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_SELLER_DECISION_BYTES))
     return error(400);
   const payload=parseSellerDecisionBytes(await readSellerDecisionBytes(request.body));
   if(!payload)return error(400);
   const result=await decideOwnSellerRequest({
     cookieValue:request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,
     origin:request.headers.get('origin'),
     fetchSite:request.headers.get('sec-fetch-site'),
     requestId:id,action:decision,payload,
   });
   if(result==='unauthorized')return error(401);
   if(result==='conflict')return error(409);
   if(result==='forbidden')return error(403);
   if(result!=='ok')return error(503);
   // No raw upstream body, session token, membership or private data.
   return NextResponse.json({outcome:'ok'},{status:200,headers:HEADERS});
 }catch{return error(503);}
}
