'use client';

import {useRef,useState} from 'react';
import Link from 'next/link';
import {readCommittedCustomerCreateReceipt} from
 '@/lib/customer-create-ui-core.mjs';

type Props={
 serviceOfferId:string;locale:'kk'|'ru';csrf:string;
};
type Phase='idle'|'sending'|'uncertain'|'rate_limited'|'conflict'|'created';
const LABELS={
 kk:{
  title:'Қызметке өтінім беру',note:'Түсініктеме (міндетті емес)',
  consent:'Өтінімді орындаушыға жіберуге келісемін',
  submit:'Өтінімді жіберу',sending:'Жіберілуде…',
  retry:'Сол өтінімді қайта тексеру',created:'Өтінім қабылданды',
  retryAfterLimit:'Лимиттен кейін осы өтінімді қайта жіберу',
  rateLimited:'Өтінімдер лимитіне жеттіңіз. Кейінірек дәл осы өтінімді қайта жіберіңіз.',
  uncertain:'Нәтиже белгісіз. Қайталанбас үшін сол кілтпен қайта тексеріңіз.',
  conflict:'Өтінім өзгерген немесе қызмет қолжетімсіз. Күйін тексеріңіз.',
  orders:'Менің өтінімдерім',counter:'1000 таңбадан аспауы тиіс',
 },
 ru:{
  title:'Оставить заявку',note:'Комментарий (необязательно)',
  consent:'Согласен отправить заявку исполнителю',
  submit:'Отправить заявку',sending:'Отправляем…',
  retry:'Проверить ту же заявку ещё раз',created:'Заявка принята',
  retryAfterLimit:'Повторить эту же заявку позже',
  rateLimited:'Лимит заявок исчерпан. Позже повторите ту же заявку.',
  uncertain:'Результат неизвестен. Повторите с тем же ключом, чтобы избежать дубля.',
  conflict:'Заявка изменена или услуга недоступна. Проверьте статус.',
  orders:'Мои заявки',counter:'Не более 1000 символов',
 },
} as const;

/**
 * Available only from the server-gated, authenticated offer page.
 * Never accepts or holds backend bearer credentials. After an unknown commit
 * the note and idempotency key are frozen until the SAME operation succeeds.
 */
export function CustomerRequestCreateForm({serviceOfferId,locale,csrf}:Props){
 const t=LABELS[locale];
 const [note,setNote]=useState('');
 const [consent,setConsent]=useState(false);
 const [phase,setPhase]=useState<Phase>('idle');
 const [receipt,setReceipt]=useState<string|null>(null);
 const key=useRef<string|null>(null);
 const busy=useRef(false);

 async function submit(){
  if(busy.current||phase==='created'||phase==='conflict'||!consent||
    note.length>1000)return;
  busy.current=true;
  setPhase('sending');
  key.current??='registered_'+crypto.randomUUID().replace(/-/g,'');
  try{
   const response=await fetch('/api/account/requests',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    redirect:'manual',signal:AbortSignal.timeout(8000),
    headers:{'Content-Type':'application/json',
     'X-Services-CSRF':csrf,'Idempotency-Key':key.current},
    body:JSON.stringify({
     service_offer_id:serviceOfferId,note:note.trim()||null,
     consent_to_contact:true,
    }),
   });
   if(response.status===429){
    // A definitive limit denial must not be shown as unknown commit.
    // Preserve the exact key and frozen form for a deliberate later retry.
    setPhase('rate_limited');return;
   }
   if(response.status===409||response.status===404){
    setPhase('conflict');return;
   }
   const result=await readCommittedCustomerCreateReceipt(response);
   if(!result)throw new Error('unverified_commit');
   setReceipt(result.id);
   setPhase('created');
   key.current=null;
  }catch{
   // Network timeout, 503 or bad receipt can all follow a backend COMMIT.
   // Never discard the key or change the body while outcome is uncertain.
   setPhase('uncertain');
  }finally{busy.current=false;}
 }
 return <section aria-labelledby="customer-create-heading">
  <h2 id="customer-create-heading">{t.title}</h2>
  {phase==='created'?<div role="status" aria-live="polite">
   <p>{t.created} · № {receipt?.slice(0,8)}</p>
   <Link href={'/'+locale+'/account/my-requests'}>{t.orders}</Link>
  </div>:<>
   <label htmlFor="customer-request-note">{t.note}</label>
   <textarea id="customer-request-note" value={note}
    onChange={event=>setNote(event.target.value)}
    disabled={phase!=='idle'} maxLength={1000} rows={3}
    aria-describedby="customer-request-note-limit"/>
   <p id="customer-request-note-limit">{t.counter}</p>
   <label>
    <input type="checkbox" checked={consent}
     onChange={event=>setConsent(event.target.checked)}
     disabled={phase!=='idle'}/>
    {t.consent}
   </label>
   <button type="button" disabled={phase==='sending'||phase==='conflict'||!consent}
    onClick={submit}>
    {phase==='sending'?t.sending:phase==='uncertain'?t.retry:
     phase==='rate_limited'?t.retryAfterLimit:t.submit}
   </button>
   {phase==='uncertain'&&<p role="alert">{t.uncertain}</p>}
   {phase==='rate_limited'&&<p role="alert">{t.rateLimited}</p>}
   {phase==='conflict'&&<p role="alert">{t.conflict}</p>}
  </>}
 </section>;
}
