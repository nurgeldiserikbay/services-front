export const MAX_GEO_RESPONSE_BYTES=131072;
const JSON_TYPE=/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8")\s*)?\s*$/i;
export async function readGeoResponse(response){
  if(!response||response.status!==200||!JSON_TYPE.test(response.headers?.get('content-type')??''))
    throw new Error('invalid_geo_response');
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>MAX_GEO_RESPONSE_BYTES))
    throw new Error('invalid_geo_response');
  if(!response.body||typeof response.body.getReader!=='function')
    throw new Error('invalid_geo_response');
  const reader=response.body.getReader();
  const chunks=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))throw new Error('invalid_geo_response');
      total+=value.byteLength;
      if(total>MAX_GEO_RESPONSE_BYTES)throw new Error('invalid_geo_response');
      chunks.push(value);
    }
  }catch{
    try{await reader.cancel();}catch{}
    throw new Error('invalid_geo_response');
  }finally{
    try{reader.releaseLock();}catch{}
  }
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let data;
  try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new Error('invalid_geo_response');}
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.items))
    throw new Error('invalid_geo_response');
  // Only the directory entries belong to the public response contract.
  // Do not reflect backend debug metadata or accidental top-level fields.
  return {items:data.items};
}
