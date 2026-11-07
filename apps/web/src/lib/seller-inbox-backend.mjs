import {parseSellerInboxPage} from './seller-inbox-ui-core.mjs';

const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const LIMIT=65536;
export class SellerInboxUnavailable extends Error{
  constructor(){super('Seller inbox unavailable');}
}
export function sellerInboxEndpoint(baseUrl,cursor=null,production=false){
  if(typeof baseUrl!=='string'||baseUrl.length>500||
    !(cursor===null||(typeof cursor==='string'&&
      /^[A-Za-z0-9_-]{1,256}$/.test(cursor))))throw new SellerInboxUnavailable();
  try{
    const url=new URL(baseUrl);
    if(!['https:','http:'].includes(url.protocol)||
      (production&&url.protocol!=='https:')||url.username||url.password||
      url.search||url.hash||!['/','/v1','/v1/'].includes(url.pathname))
      throw new SellerInboxUnavailable();
    url.pathname='/v1/me/seller-requests';
    url.searchParams.set('limit','20');
    if(cursor)url.searchParams.set('cursor',cursor);
    return url.toString();
  }catch{throw new SellerInboxUnavailable();}
}
/** Backend session is held server-side; no redirects or response forwarding. */
export async function readSellerInbox({baseUrl,bearer,cursor=null,
  production=false,transport=fetch}){
  if(typeof bearer!=='string'||!TOKEN.test(bearer))
    throw new SellerInboxUnavailable();
  const url=sellerInboxEndpoint(baseUrl,cursor,production);
  try{
    const response=await transport(url,{
      method:'GET',cache:'no-store',redirect:'manual',credentials:'omit',
      headers:{Accept:'application/json',Authorization:'Bearer '+bearer},
      signal:AbortSignal.timeout(5000),
    });
    if(response.status!==200||
      !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
      throw new SellerInboxUnavailable();
    const declared=response.headers.get('content-length');
    if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>LIMIT))
      throw new SellerInboxUnavailable();
    // Stream with a hard limit; do not trust Content-Length or unbounded text().
    if(!response.body)throw new SellerInboxUnavailable();
    const reader=response.body.getReader();
    const chunks=[];let size=0;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>LIMIT)throw new SellerInboxUnavailable();
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return parseSellerInboxPage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch{throw new SellerInboxUnavailable();}
}
