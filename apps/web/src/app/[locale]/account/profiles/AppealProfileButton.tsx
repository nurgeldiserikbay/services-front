'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {confirmedProfileMutation} from '@/lib/profile-mutation-ack.mjs';
export default function AppealProfileButton({id,version,decisionId,csrf,kk}:{
 id:string;version:number;decisionId:string;csrf:string;kk:boolean;
}){
 const router=useRouter(),inFlight=useRef(false);
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[finished,setFinished]=useState(false),[message,setMessage]=useState('');
 async function submit(){
  if(inFlight.current||busy||finished||!confirmed)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/account/profiles/'+id+'/appeals',{
    method:'POST',headers:{'Content-Type':'application/json','x-services-csrf':csrf,'If-Match':'"'+version+'"'},
    body:JSON.stringify({decision_id:decisionId}),credentials:'same-origin',
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
   });
   if(await confirmedProfileMutation(response,'appeal')){setFinished(true);setMessage(kk?'Шағым тіркелді.':'Обращение зарегистрировано.');router.refresh();}
   else if(response.status===409){setFinished(true);setMessage(kk?'Шешім не профиль нұсқасы өзгерген. Бетті жаңартыңыз.':'Решение или версия профиля изменились. Обновите страницу.');}
   else {setFinished(true);setMessage(kk?'Нәтиже белгісіз. Қайта шағым жібермей, бетті жаңартыңыз.':'Результат неизвестен. Обновите страницу, не отправляя обращение повторно.');}
  }catch{setFinished(true);setMessage(kk?'Нәтиже белгісіз. Қайта шағым жібермей, бетті жаңартыңыз.':'Результат неизвестен. Обновите страницу, не отправляя обращение повторно.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section aria-label={kk?'Модерация шешіміне шағым':'Обжалование решения модерации'}>
  <h2>{kk?'Шешімге шағымдану':'Обжаловать решение'}</h2>
  <p>{kk?'Профильдің осы нұсқасына бас тарту шешімі бар. Шағым жеке қаралады, бірден жарияламайды.':'По этой версии профиля есть отказ. Обращение будет рассмотрено отдельно и не приведёт к автоматической публикации.'}</p>
  <label><input type="checkbox" checked={confirmed} disabled={busy||finished} onChange={e=>setConfirmed(e.target.checked)}/>
   {kk?'Шешімді қарап, шағым бергім келеді.':'Я ознакомился с решением и хочу подать обращение.'}</label>
  <button type="button" onClick={submit} disabled={!confirmed||busy||finished}>{kk?'Шағым жіберу':'Отправить обращение'}</button>
  {finished&&<button type="button" onClick={()=>window.location.reload()}>{kk?'Бетті жаңарту':'Обновить страницу'}</button>}
  <p role="status" aria-live="polite">{message}</p>
 </section>;
}
