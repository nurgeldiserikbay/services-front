'use client';

import {useRouter} from 'next/navigation';
import {useRef,useState} from 'react';

type Props={requestId:string;version:number;csrf:string;locale:'kk'|'ru'};

/** No bearer or customer ID is ever exposed to the browser. */
export function CustomerCompletionAction({requestId,version,csrf,locale}:Props){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const inFlight=useRef(false);
 const [status,setStatus]=useState<'idle'|'done'|'conflict'|'unavailable'>('idle');
 const kk=locale==='kk';
 const complete=async()=>{
  // A mutation can commit even if its HTTP response is lost. Never send
  // another completion with stale version until the server page is reloaded.
  if(inFlight.current||status!=='idle')return;
  inFlight.current=true;
  setBusy(true);
  try{
   const response=await fetch('/api/account/requests/'+encodeURIComponent(requestId)+'/complete',{
    method:'POST',
    headers:{'Content-Type':'application/json','If-Match':'"'+version+'"',
     'X-Services-CSRF':csrf},
    body:'{}',credentials:'same-origin',cache:'no-store',redirect:'manual',
    signal:AbortSignal.timeout(8000),
   });
   if(response.status===200){
    setStatus('done');router.refresh();
   }else if(response.status===409||response.status===404){
    setStatus('conflict');
   }else setStatus('unavailable');
  }catch{setStatus('unavailable');}
  finally{inFlight.current=false;setBusy(false);}
 };
 return <div>
  <button type="button" disabled={busy||status!=='idle'} onClick={complete}>
   {busy?(kk?'Расталуда…':'Подтверждение…'):
    status==='done'?(kk?'Расталды':'Подтверждено'):
    (kk?'Аяқталғанын растау':'Подтвердить завершение')}
  </button>
  <p role="status" aria-live="polite">
   {status==='conflict'?(kk?'Өтінім өзгерген. Тізімді жаңартыңыз.':
    'Заявка изменилась. Обновите список.'):
    status==='unavailable'?(kk?'Нәтиже белгісіз. Қайталап жібермей, күйін жаңартып тексеріңіз.':
     'Результат неизвестен. Проверьте статус перед повторной попыткой.'):null}
  </p>
  {(status==='conflict'||status==='unavailable')&&
   <button type="button" onClick={()=>window.location.reload()}>
    {kk?'Күйін қайта жүктеп тексеру':'Перезагрузить и проверить статус'}
   </button>}
 </div>;
}
