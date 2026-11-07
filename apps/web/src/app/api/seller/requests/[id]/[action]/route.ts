import {NextRequest,NextResponse} from 'next/server';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {decideOwnSellerRequest} from '@/lib/seller-bff.server';
import {parseSellerDecisionBytes,readSellerDecisionBytes,sellerBffSameOrigin}
 from '@/lib/seller-bff-route-core.mjs';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';

const HEADERS={
 'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow',
 'Referrer-Policy':'no-referrer','Vary':'Cookie, Origin, Sec-Fetch-Site',
} as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context={params:Promise<{id:string;action:string}>};
function failure(status:400|401|403|404|409|415|503){
 const codes:Record<number,string>={400:'INVALID_REQUEST',401:'AUTH_REQUIRED',
   403:'FORBIDDEN',404:'NOT_FOUND',409:'CONFLICT',415:'UNSUPPORTED_MEDIA_TYPE',
   503:'UNAVAILABLE'};
 return NextResponse.json({code:codes[status]},{status,headers:HEADERS});
}

/** Server-only authenticated mutation; the browser never supplies an account bearer. */
export async function POST(request:NextRequest,context:Context):Promise<NextResponse>{
 if(process.env.SERVICES_WEB_ENABLE_SELLER_BFF!=='enabled')return failure(404);
 if(!sellerBffSameOrigin(request.headers.get('sec-fetch-site')))return failure(403);
 const {id,action}=await context.params;
 if(!UUID.test(id)||(action!=='accept'&&action!=='decline')||
    new URL(request.url).search!=='')return failure(400);
 if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')??''))
   return failure(415);
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>1024))
   return failure(400);
 let payload;
 try{payload=parseSellerDecisionBytes(await readSellerDecisionBytes(request.body));}
 catch{return failure(400);}
 if(!payload)return failure(400);
 try{
   const result=await decideOwnSellerRequest({
     cookieValue:request.cookies.get(ACCOUNT_WEB_COOKIE)?.value,
     origin:request.headers.get('origin'),fetchSite:request.headers.get('sec-fetch-site'),
     requestId:id,action,payload,
   });
   if(result==='ok')return NextResponse.json({outcome:'ok'},{headers:HEADERS});
   if(result==='unauthorized')return failure(401);
   if(result==='forbidden')return failure(403);
   if(result==='conflict')return failure(409);
   return failure(503);
 }catch{return failure(503);}
}
