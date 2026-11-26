'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useRequestMutationGate} from './RequestMutationGate';
import {buildScheduleProposal,readScheduleProposalReceipt} from '@/lib/customer-schedule-ui-core.mjs';

export function CustomerScheduleProposal({requestId,version,csrf,locale,actor='customer',onChanged,guest=false,onRecover}:{
 requestId:string;version:number;csrf:string;locale:'kk'|'ru';actor?:'customer'|'seller';onChanged?:()=>void;guest?:boolean;onRecover?:()=>void;
}){
 const kk=locale==='kk',router=useRouter();
 const formRef=useRef<HTMLFormElement>(null);
 const [zone,setZone]=useState('Asia/Almaty'),[offset,setOffset]=useState('300');
 const [status,setStatus]=useState<'idle'|'invalid'|'busy'|'done'|'conflict'|'unknown'>('idle');
 const inFlight=useRef(false);
 const gate=useRequestMutationGate();
 const editable=status==='idle'||status==='invalid';
 const submit=async()=>{
  if(!editable||inFlight.current)return;
  if(!formRef.current)return;
  const values=new FormData(formRef.current);
  const start=values.get('start'),end=values.get('end');
  const body=typeof start==='string'&&typeof end==='string'&&offset.trim()!==''?buildScheduleProposal(start,end,zone,Number(offset)):null;
  if(!body){setStatus('invalid');return;}
  if(gate&&!gate.acquire())return;
  inFlight.current=true;setStatus('busy');
  try{
   const response=await fetch((guest?'/api/guest-requests/':'/api/account/requests/')+encodeURIComponent(requestId)+'/schedule-proposals',{
    method:'POST',headers:{'Content-Type':'application/json','If-Match':'"'+version+'"',
     'Idempotency-Key':crypto.randomUUID(),'X-Services-CSRF':csrf},
    body:JSON.stringify(body),credentials:'same-origin',cache:'no-store',redirect:'manual',
    signal:AbortSignal.timeout(8000),
   });
   if(response.status===409||response.status===404)setStatus('conflict');
   else if(await readScheduleProposalReceipt(response,requestId,version,body,actor)){
    setStatus('done');if(onChanged)onChanged();else router.refresh();
   }else setStatus('unknown');
  }catch{setStatus('unknown');}
  finally{inFlight.current=false;}
 };
 return <details>
  <summary>{kk?'Жаңа уақыт ұсыну':'Предложить новое время'}</summary>
  <p>{kk?'Жаңа ұсыныс бұрынғы белсенді ұсынысты алмастыруы мүмкін.':'Новое предложение может заменить предыдущее активное предложение.'}</p>
  <form ref={formRef} onSubmit={e=>{e.preventDefault();void submit();}}>
   <fieldset disabled={!editable||!!gate?.locked}>
    <label>{kk?'Басталуы':'Начало'}<input type="datetime-local" required name="start" defaultValue=""/></label>
    <label>{kk?'Аяқталуы':'Окончание'}<input type="datetime-local" required name="end" defaultValue=""/></label>
    <label>{kk?'Уақыт белдеуі (IANA)':'Часовой пояс (IANA)'}<input required maxLength={64} value={zone} onChange={e=>setZone(e.target.value)}/></label>
    <label>{kk?'UTC ығысуы, минут':'Смещение UTC, минуты'}<input type="number" min={-840} max={840} step={1} required value={offset} onChange={e=>setOffset(e.target.value)}/></label>
    <button type="submit">{kk?'Ұсынысты жіберу':'Отправить предложение'}</button>
   </fieldset>
  </form>
  <p role="status" aria-live="polite">{status==='invalid'?(kk?'Уақыт пен UTC ығысуын тексеріңіз.':'Проверьте время и смещение UTC.'):
   status==='busy'?(kk?'Жіберілуде…':'Отправка…'):
   status==='done'?(kk?'Ұсыныс жіберілді. Екінші тараптың келісімі қажет.':'Предложение отправлено. Требуется согласие второй стороны.'):
   status==='conflict'||status==='unknown'?(kk?'Нәтижені қайта жүктеп тексеріңіз.':'Перезагрузите страницу и проверьте результат.'):null}</p>
  {(status==='conflict'||status==='unknown')&&<button type="button" onClick={()=>{if(onRecover)onRecover();else window.location.reload();}}>{kk?'Қайта жүктеу':'Перезагрузить'}</button>}
 </details>;
}
