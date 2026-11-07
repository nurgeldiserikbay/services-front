import {validateNotificationInbox} from './account-notifications-transport.mjs';

const MAX_BYTES=32768;

/**
 * Read a bounded same-origin notification reply without buffering untrusted
 * response.text(). A stale/partial response never becomes visible.
 */
export async function readNotificationBrowserReply(response){
 if(!response||response.status!==200||
  !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
  throw new Error('unavailable');
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES))
  throw new Error('unavailable');
 if(!response.body)throw new Error('unavailable');
 const reader=response.body.getReader();
 const chunks=[];let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>MAX_BYTES)throw new Error('unavailable');
   chunks.push(value);
  }
 }catch{
  await reader.cancel().catch(()=>{});
  throw new Error('unavailable');
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{
  return validateNotificationInbox(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }catch{throw new Error('unavailable');}
}

const COPY={
 kk:{
  'service_request.accepted':'Өтінім қабылданды',
  'service_request.declined':'Өтінім қабылданбады',
  'service_request.cancelled':'Өтінім тоқтатылды',
  'service_request.created':'Жаңа өтінім',
  fallback:'Өтінім бойынша жаңалық',
 },
 ru:{
  'service_request.accepted':'Заявка принята',
  'service_request.declined':'Заявка отклонена',
  'service_request.cancelled':'Заявка отменена',
  'service_request.created':'Новая заявка',
  fallback:'Обновление по заявке',
 },
};
export function notificationTopicLabel(locale,topic){
 const t=COPY[locale];
 if(!t)return '';
 return Object.prototype.hasOwnProperty.call(t,topic)&&topic!=='fallback'
  ?t[topic]:t.fallback;
}
