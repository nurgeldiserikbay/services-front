'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {confirmedProfileMutation} from '@/lib/profile-mutation-ack.mjs';
export default function PublishProfileButton({id,version,csrf,kk}:{id:string;version:number;csrf:string;kk:boolean}){
 const router=useRouter();const inFlight=useRef(false);
 const [busy,setBusy]=useState(false),[stale,setStale]=useState(false),[message,setMessage]=useState('');
 async function publish(){
  if(inFlight.current||stale)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/account/profiles/'+id+'/publish',{
    method:'POST',headers:{'Content-Type':'application/json','x-services-csrf':csrf,'If-Match':'"'+version+'"'},
    body:'{}',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
   });
   if(await confirmedProfileMutation(response,'publish')){setMessage(kk?'Жарияланды.':'Опубликовано.');setStale(true);router.refresh();}
   else if(response.status===409){setStale(true);setMessage(kk?'Профиль өзгерген немесе жариялауға дайын емес. Деректерді жаңартыңыз.':'Профиль изменён или не готов к публикации. Обновите данные.');}
   else {setStale(true);setMessage(kk?'Нәтиже белгісіз. Қайта жарияламай, бетті жаңартыңыз.':'Результат неизвестен. Обновите страницу, не публикуя повторно.');}
  }catch{setStale(true);setMessage(kk?'Нәтиже белгісіз. Қайта жарияламай, бетті жаңартыңыз.':'Результат неизвестен. Обновите страницу, не публикуя повторно.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section aria-label={kk?'Жариялау':'Публикация'}>
  <p>{kk?'Жариялау профиліңізді өзгелерге көрсетуі мүмкін. Алдымен мазмұнды тексеріңіз.':'Публикация может сделать профиль видимым другим. Сначала проверьте содержание.'}</p>
  <button type="button" disabled={busy||stale} onClick={publish}>{kk?'Профильді жариялау':'Опубликовать профиль'}</button>
  {stale&&<button type="button" onClick={()=>window.location.reload()}>{kk?'Жаңарту':'Обновить'}</button>}
  <p role="status" aria-live="polite">{message}</p>
 </section>;
}
