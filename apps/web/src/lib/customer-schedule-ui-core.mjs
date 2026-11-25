const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WALL=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function wallAt(formatter,date){
 const p=Object.fromEntries(formatter.formatToParts(date).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second;
}
/** Explicit local timezone and offset, never silently use browser timezone. */
export function buildScheduleProposal(start,end,timezone,offsetMinutes){
 if(typeof start!=='string'||typeof end!=='string'||!WALL.test(start)||!WALL.test(end)||
  typeof timezone!=='string'||!Number.isInteger(offsetMinutes)||Math.abs(offsetMinutes)>840)return null;
 try{
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',
   day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  if(formatter.resolvedOptions().timeZone!==timezone)return null;
  const a=new Date(Date.parse(start+':00Z')-offsetMinutes*60000);
  const b=new Date(Date.parse(end+':00Z')-offsetMinutes*60000);
  if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||b<=a||
   wallAt(formatter,a)!==start+':00'||wallAt(formatter,b)!==end+':00')return null;
  return {start_at:a.toISOString(),end_at:b.toISOString(),timezone,local_start_at:start+':00',utc_offset_seconds:offsetMinutes*60};
 }catch{return null;}
}
export async function readScheduleProposalReceipt(response,id,version,body){
 if(response.status!==201||response.headers.has('content-range')||
  !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
  !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control')??'')||
  /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(response.headers.get('cache-control')??'')||!response.body)return false;
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||Number(length)>2048))return false;
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let bytes=0,raw='',complete=false;
 try{
  for(;;){
   const chunk=await reader.read();
   if(chunk.done){complete=true;break;}
   bytes+=chunk.value.byteLength;
   if(bytes>2048)return false;
   raw+=decoder.decode(chunk.value,{stream:true});
  }
  raw+=decoder.decode();
  const r=JSON.parse(raw);
  return !!r&&typeof r==='object'&&!Array.isArray(r)&&
   Object.keys(r).sort().join(',')==='end_at,id,initiator,replayed,request_id,request_version,revision,start_at,status,timezone'&&
   typeof r.id==='string'&&UUID.test(r.id)&&r.request_id===id&&r.request_version===version+1&&
   r.status==='proposed'&&r.initiator==='customer'&&typeof r.replayed==='boolean'&&
   Number.isSafeInteger(r.revision)&&r.revision>0&&
   r.start_at===body.start_at&&r.end_at===body.end_at&&r.timezone===body.timezone;
 }catch{return false;}
 finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
