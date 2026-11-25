'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {buildScheduleProposal,readScheduleProposalReceipt} from '@/lib/customer-schedule-ui-core.mjs';

export function CustomerScheduleProposal({requestId,version,csrf,locale}:{
 requestId:string;version:number;csrf:string;locale:'kk'|'ru';
}){
 const kk=locale==='kk',router=useRouter();
 const [start,setStart]=useState(''),[end,setEnd]=useState('');
 const [zone,setZone]=useState('Asia/Almaty'),[offset,setOffset]=useState('300');
 const [status,setStatus]=useState<'idle'|'invalid'|'busy'|'done'|'conflict'|'unknown'>('idle');
 const inFlight=useRef(false);
 const editable=status==='idle'||status==='invalid';
 const submit=async()=>{
  if(!editable||inFlight.current)return;
  const body=offset.trim()!==''?buildScheduleProposal(start,end,zone,Number(offset)):null;
  if(!body){setStatus('invalid');return;}
  inFlight.current=true;setStatus('busy');
  try{
   const response=await fetch('/api/account/requests/'+encodeURIComponent(requestId)+'/schedule-proposals',{
    method:'POST',headers:{'Content-Type':'application/json','If-Match':'"'+version+'"',
     'Idempotency-Key':crypto.randomUUID(),'X-Services-CSRF':csrf},
    body:JSON.stringify(body),credentials:'same-origin',cache:'no-store',redirect:'manual',
    signal:AbortSignal.timeout(8000),
   });
   if(response.status===409||response.status===404)setStatus('conflict');
   else if(await readScheduleProposalReceipt(response,requestId,version,body)){
    setStatus('done');router.refresh();
   }else setStatus('unknown');
  }catch{setStatus('unknown');}
  finally{inFlight.current=false;}
 };
 return <details>
  <summary>{kk?'Жаңа уақыт ұсыну':'Предложить новое время'}</summary>
  <p>{kk?'Жаңа ұсыныс бұрынғы белсенді ұсынысты алмастыруы мүмкін.':'Новое предложение может заменить предыдущее активное предложение.'}</p>
  <form onSubmit={e=>{e.preventDefault();void submit();}}>
   <fieldset disabled={!editable}>
    <label>{kk?'Басталуы':'Начало'}<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>{kk?'Аяқталуы':'Окончание'}<input type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <label>{kk?'Уақыт белдеуі (IANA)':'Часовой пояс (IANA)'}<input required maxLength={64} value={zone} onChange={e=>setZone(e.target.value)}/></label>
    <label>{kk?'UTC ығысуы, минут':'Смещение UTC, минуты'}<input type="number" min={-840} max={840} step={1} required value={offset} onChange={e=>setOffset(e.target.value)}/></label>
    <button type="submit">{kk?'Ұсынысты жіберу':'Отправить предложение'}</button>
   </fieldset>
  </form>
  <p role="status" aria-live="polite">{status==='invalid'?(kk?'Уақыт пен UTC ығысуын тексеріңіз.':'Проверьте время и смещение UTC.'):
   status==='busy'?(kk?'Жіберілуде…':'Отправка…'):
   status==='done'?(kk?'Ұсыныс жіберілді. Екінші тараптың келісімі қажет.':'Предложение отправлено. Требуется согласие второй стороны.'):
   status==='conflict'||status==='unknown'?(kk?'Нәтижені қайта жүктеп тексеріңіз.':'Перезагрузите страницу и проверьте результат.'):null}</p>
  {(status==='conflict'||status==='unknown')&&<button type="button" onClick={()=>window.location.reload()}>{kk?'Қайта жүктеу':'Перезагрузить'}</button>}
 </details>;
}
