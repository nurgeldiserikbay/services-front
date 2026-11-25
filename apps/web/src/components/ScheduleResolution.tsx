'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {ActiveScheduleView} from '@/lib/account-session-transport.mjs';
import {readScheduleResolutionReceipt} from '@/lib/customer-schedule-ui-core.mjs';

export function ScheduleResolution({view,csrf,locale}:{view:ActiveScheduleView;csrf:string;locale:'kk'|'ru'}){
 const kk=locale==='kk',router=useRouter(),p=view.proposal;
 const [status,setStatus]=useState<'idle'|'busy'|'done'|'unknown'>('idle');
 const busy=useRef(false);
 if(!p)return <p>{kk?'Белсенді ұсыныс жоқ.':'Нет активного предложения.'}</p>;
 const resolve=async(action:'confirm'|'decline')=>{
  if(!p.can_resolve||status!=='idle'||busy.current)return;
  busy.current=true;setStatus('busy');
  try{
   const response=await fetch('/api/account/requests/'+encodeURIComponent(view.request_id)+'/schedule-proposals/'+encodeURIComponent(p.id)+'/'+action,{
    method:'POST',headers:{'Content-Type':'application/json','If-Match':'"'+view.request_version+'"',
     'Idempotency-Key':crypto.randomUUID(),'X-Services-CSRF':csrf},
    body:'{}',credentials:'same-origin',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000),
   });
   if(await readScheduleResolutionReceipt(response,view,action)){setStatus('done');router.refresh();}
   else setStatus('unknown');
  }catch{setStatus('unknown');}
  finally{busy.current=false;}
 };
 const format=(v:string)=>new Intl.DateTimeFormat(kk?'kk-KZ':'ru-KZ',{timeZone:p.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
 let interval:string;
 try{interval=format(p.start_at)+' — '+format(p.end_at)+' ('+p.timezone+')';}
 catch{interval=p.start_at+' — '+p.end_at+' UTC';}
 return <section>
  <strong>{kk?'Белсенді уақыт ұсынысы':'Активное предложение времени'}</strong>
  <p>{interval}</p>
  <p>{p.initiator==='customer'?(kk?'Клиент ұсынды':'Предложение клиента'):(kk?'Орындаушы ұсынды':'Предложение исполнителя')}</p>
  {p.can_resolve&&<div>
   <button type="button" disabled={status!=='idle'} onClick={()=>void resolve('confirm')}>{kk?'Растау':'Подтвердить'}</button>
   <button type="button" disabled={status!=='idle'} onClick={()=>void resolve('decline')}>{kk?'Қабылдамау':'Отклонить'}</button>
  </div>}
  {!p.can_resolve&&<p>{kk?'Сіз бұл ұсынысты қазір растай алмайсыз.':'Вы не можете сейчас подтвердить это предложение.'}</p>}
  <p role="status">{status==='busy'?(kk?'Жіберілуде…':'Отправка…'):status==='done'?(kk?'Сақталды.':'Сохранено.'):status==='unknown'?(kk?'Нәтижені қайта жүктеп тексеріңіз.':'Перезагрузите страницу и проверьте результат.'):null}</p>
  {status==='unknown'&&<button type="button" onClick={()=>window.location.reload()}>{kk?'Қайта жүктеу':'Перезагрузить'}</button>}
 </section>;
}
