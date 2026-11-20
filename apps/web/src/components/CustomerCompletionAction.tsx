'use client';

import {useRouter} from 'next/navigation';
import {useState} from 'react';

type Props={requestId:string;version:number;csrf:string;locale:'kk'|'ru'};

/** No bearer or customer ID is ever exposed to the browser. */
export function CustomerCompletionAction({requestId,version,csrf,locale}:Props){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<'idle'|'done'|'conflict'|'unavailable'>('idle');
 const kk=locale==='kk';
 const complete=async()=>{
  if(busy||status==='done')return;
  setBusy(true);setStatus('idle');
  try{
   const response=await fetch('/api/account/requests/'+encodeURIComponent(requestId)+'/complete',{
    method:'POST',
    headers:{'Content-Type':'application/json','If-Match':'"'+version+'"',
     'X-Services-CSRF':csrf},
    body:'{}',credentials:'same-origin',cache:'no-store',redirect:'manual',
   });
   if(response.status===200){
    setStatus('done');router.refresh();
   }else if(response.status===409||response.status===404){
    setStatus('conflict');
   }else setStatus('unavailable');
  }catch{setStatus('unavailable');}
  finally{setBusy(false);}
 };
 return <div>
  <button type="button" disabled={busy||status==='done'} onClick={complete}>
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
 </div>;
}
