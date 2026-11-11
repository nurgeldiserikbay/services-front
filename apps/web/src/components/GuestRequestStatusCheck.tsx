'use client';

import {useLayoutEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {
  privateGuestStatusUrl,readPrivateGuestStatusResponse,shouldReplaceGuestStatus,
  type PrivateGuestStatusState,
} from '@/lib/guest-status-ui-core.mjs';
import styles from './GuestRequestStatusCheck.module.css';
import {RequestTimeline} from './RequestTimeline';

const translations={
  kk:{
    heading:'Өтінімнің қазіргі күйі',refresh:'Күйін жаңарту',
    loading:'Күй тексерілуде…',error:'Күйді қазір тексеру мүмкін болмады. Қайта көріңіз.',
    idle:'Өтінімнің күйін көру үшін «Күйін жаңарту» батырмасын басыңыз.',
    version:'Жаңарту нұсқасы',statuses:{
      pending:'Орындаушы жауабын күтуде',
      accepted:'Орындаушы қабылдады',declined:'Орындаушы қабылдамады',
      completed:'Қызмет аяқталды',expired:'Өтінімнің мерзімі аяқталды',
      cancelled_by_customer:'Клиент болдырмады',
      cancelled_by_provider:'Орындаушы болдырмады',
      cancelled_mutual:'Екі жақтың келісімімен болдырылмады',
    },
  },
  ru:{
    heading:'Текущий статус заявки',refresh:'Обновить статус',
    loading:'Проверяем статус…',error:'Не удалось проверить статус. Повторите позже.',
    idle:'Нажмите «Обновить статус», чтобы проверить заявку.',
    version:'Версия обновления',statuses:{
      pending:'Ожидает ответа исполнителя',
      accepted:'Исполнитель принял заявку',declined:'Исполнитель отклонил заявку',
      completed:'Услуга завершена',expired:'Срок заявки истёк',
      cancelled_by_customer:'Отменена клиентом',
      cancelled_by_provider:'Отменена исполнителем',
      cancelled_mutual:'Отменена по соглашению сторон',
    },
  },
} as const;

/** Manual refresh only: no background polling, no contact/OTP or bearer exposure. */
export function GuestRequestStatusCheck({locale,requestId,serviceOfferId}:{
  locale:Locale;requestId:string;serviceOfferId:string;
}){
  const t=translations[locale];
  const [state,setState]=useState<PrivateGuestStatusState|null>(null);
  const [version,setVersion]=useState<number|null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState(false);
  const active=useRef<AbortController|null>(null);
  const busy=useRef(false);
  const currentVersion=useRef<number|null>(null);
  // A receipt switch invalidates both the displayed result and in-flight
  // requests. Never show one customer's status for another receipt.
  useLayoutEffect(()=>{
    active.current?.abort();
    active.current=null;
    busy.current=false;
    currentVersion.current=null;
    setState(null);
    setVersion(null);
    setPending(false);
    setError(false);
    return ()=>{
      active.current?.abort();
      active.current=null;
      busy.current=false;
    };
  },[requestId,serviceOfferId]);

  async function refresh(){
    if(busy.current)return;
    // Abort any request retained from a previous receipt before starting a new one.
    active.current?.abort();
    busy.current=true;setPending(true);setError(false);
    const controller=new AbortController();
    active.current=controller;
    try{
      // A stalled status endpoint must not leave the refresh button disabled.
      // Keep receipt-switch cancellation separate from the request deadline.
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(10_000)]);
      const response=await fetch(privateGuestStatusUrl(requestId),{
        method:'GET',cache:'no-store',credentials:'same-origin',
        redirect:'error',signal,
      });
      const result=await readPrivateGuestStatusResponse(
        response,requestId,serviceOfferId,
      );
      // A deadline may expire while the response body is being decoded,
      // even if fetch already returned its headers.
      if(signal.aborted||active.current!==controller)return;
      // Never regress the displayed status when out-of-order responses arrive.
      if(shouldReplaceGuestStatus(currentVersion.current,result.version)){
        currentVersion.current=result.version;
        setState(result.state);
        setVersion(result.version);
      }
    }catch{
      if(!controller.signal.aborted&&active.current===controller){
        // An expired request capability or failed backend revalidation must
        // never leave a stale status looking like a fresh verified answer.
        currentVersion.current=null;
        setVersion(null);setState(null);setError(true);
      }
    }finally{
      // A stale request must not unlock or clear the loading state of a newer one.
      if(active.current===controller){
        active.current=null;
        busy.current=false;
        if(!controller.signal.aborted)setPending(false);
      }
    }
  }

  return <section aria-label={t.heading} className={styles.panel}>
    <h3>{t.heading}</h3>
    <p role="status" aria-live="polite">{pending?t.loading:version!==null&&state!==null?t.statuses[state]:t.idle}</p>
    {version!==null&&state!==null&&<>
      <small>{t.version}: {version}</small>
      <RequestTimeline state={state} locale={locale}/>
    </>}
    {error&&<p role="alert" className={styles.error}>{t.error}</p>}
    <button type="button" onClick={refresh} disabled={pending}>
      {t.refresh}
    </button>
  </section>;
}
