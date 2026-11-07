'use client';

import {useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {
  privateGuestStatusUrl,readPrivateGuestStatusResponse,
  type PrivateGuestStatusState,
} from '@/lib/guest-status-ui-core.mjs';
import styles from './GuestRequestStatusCheck.module.css';
import {buildRequestTimeline} from '@/lib/request-timeline';

const translations={
  kk:{
    heading:'Өтінімнің қазіргі күйі',refresh:'Күйін жаңарту',
    loading:'Күй тексерілуде…',error:'Күйді қазір тексеру мүмкін болмады. Қайта көріңіз.',
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
  const [state,setState]=useState<PrivateGuestStatusState>('pending');
  const [version,setVersion]=useState<number|null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState(false);
  const active=useRef<AbortController|null>(null);
  const busy=useRef(false);
  const currentVersion=useRef<number|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);

  async function refresh(){
    if(busy.current)return;
    busy.current=true;setPending(true);setError(false);
    const controller=new AbortController();
    active.current=controller;
    try{
      const response=await fetch(privateGuestStatusUrl(requestId),{
        method:'GET',cache:'no-store',credentials:'same-origin',
        redirect:'error',signal:controller.signal,
      });
      const result=await readPrivateGuestStatusResponse(
        response,requestId,serviceOfferId,
      );
      if(controller.signal.aborted)return;
      // Never regress the displayed status when out-of-order responses arrive.
      if(currentVersion.current===null||result.version>=currentVersion.current){
        currentVersion.current=result.version;
        setState(result.state);
        setVersion(result.version);
      }
    }catch{
      if(!controller.signal.aborted)setError(true);
    }finally{
      if(active.current===controller)active.current=null;
      busy.current=false;
      if(!controller.signal.aborted)setPending(false);
    }
  }

  const timeline=buildRequestTimeline(state,locale);
  return <section aria-label={t.heading} className={styles.panel}>
    <h3>{t.heading}</h3>
    <p role="status" aria-live="polite">{pending?t.loading:t.statuses[state]}</p>
    {version!==null&&<>
      <small>{t.version}: {version}</small>
      <ol className={styles.timeline} aria-label={locale==='kk'?'Өтінім барысы':'Ход заявки'}>
        {timeline.steps.map(step=><li key={step.key}
          className={step.complete?styles.complete:styles.waiting}
          aria-current={!step.complete&&step.key==='accepted'&&state==='pending'?'step':undefined}>
          <span aria-hidden="true" className={styles.marker}>{step.complete?'✓':'·'}</span>
          <span>{step.label}</span>
        </li>)}
      </ol>
      <p className={styles.timelineStatus}>{timeline.status}</p>
    </>}
    {error&&<p role="alert" className={styles.error}>{t.error}</p>}
    <button type="button" onClick={refresh} disabled={pending}>
      {t.refresh}
    </button>
  </section>;
}
