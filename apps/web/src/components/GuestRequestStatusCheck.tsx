'use client';

import {useLayoutEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {
  privateGuestStatusUrl,readPrivateGuestStatusResponse,shouldReplaceGuestStatus,withGuestStatusAbort,
  type PrivateGuestStatusState,
} from '@/lib/guest-status-ui-core.mjs';
import styles from './GuestRequestStatusCheck.module.css';
import {RequestTimeline} from './RequestTimeline';
import {GuestRequestCompletion} from './GuestRequestCompletion';
import {shouldResetGuestCompletionAfterVerifiedRefresh} from '@/lib/guest-completion-ui-core.mjs';

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

type Props={locale:Locale;requestId:string;serviceOfferId:string;completionEnabled?:boolean};

/** A receipt switch must replace the whole stateful subtree during React's
 * render, not after an effect: no old customer's status is ever painted.
 * Manual refresh only; no background polling or bearer exposure.
 */
export function GuestRequestStatusCheck(props:Props){
  return <ReceiptStatusView key={props.requestId+'|'+props.serviceOfferId} {...props}/>;
}
function ReceiptStatusView({locale,requestId,serviceOfferId,completionEnabled=false}:Props){
  const t=translations[locale];
  const [state,setState]=useState<PrivateGuestStatusState|null>(null);
  const [version,setVersion]=useState<number|null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState(false);
  const [completionRefreshEpoch,setCompletionRefreshEpoch]=useState(0);
  const active=useRef<AbortController|null>(null);
  const busy=useRef(false);
  const currentVersion=useRef<number|null>(null);
  // The key on ReceiptStatusView resets every state/ref at render time when
  // the receipt changes. Cleanup only aborts work for an unmounted receipt.
  useLayoutEffect(()=>()=>{
    active.current?.abort();
    active.current=null;
    busy.current=false;
  },[]);

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
      // The request deadline must also cover a stalled body reader, not just
      // fetch headers. Always remove the abort listener after settling.
      const result=await withGuestStatusAbort(
        ()=>readPrivateGuestStatusResponse(response,requestId,serviceOfferId),signal,
      );
      // A deadline may expire while the response body is being decoded,
      // even if fetch already returned its headers.
      if(active.current!==controller||controller.signal.aborted)return;
      // A timeout after headers/body parsing is still a failed verification.
      // Do not silently retain an older status as if refresh succeeded.
      if(signal.aborted)throw new Error('guest_status_timeout');
      // Never regress the displayed status when out-of-order responses arrive.
      if(shouldReplaceGuestStatus(currentVersion.current,result.version)){
        currentVersion.current=result.version;
        setState(result.state);
        setVersion(result.version);
      }else if(shouldResetGuestCompletionAfterVerifiedRefresh(
        currentVersion.current,result.version,result.state)){
        // A verified refresh of the same accepted version is the only safe
        // way to leave the completion UI's ambiguous-commit lock. Remount
        // its short-lived OTP/CSRF state; never retry the old mutation.
        setCompletionRefreshEpoch(value=>value+1);
      }
    }catch{
      // A deadline abort is a failed refresh, unlike a receipt-switch abort.
      if(active.current===controller&&!controller.signal.aborted){
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
        setPending(false);
      }
    }
  }

  return <section aria-label={t.heading} className={styles.panel}>
    <h3>{t.heading}</h3>
    {!error&&<p role="status" aria-live="polite">{pending?t.loading:version!==null&&state!==null?t.statuses[state]:t.idle}</p>}
    {version!==null&&state!==null&&<>
      <small>{t.version}: {version}</small>
      <RequestTimeline state={state} locale={locale}/>
      {completionEnabled&&state==='accepted'&&<GuestRequestCompletion
        key={requestId+'|'+version+'|'+completionRefreshEpoch} locale={locale} requestId={requestId}
        version={version} onRefresh={refresh}/>}
    </>}
    {error&&<p role="alert" className={styles.error}>{t.error}</p>}
    <button type="button" onClick={refresh} disabled={pending}>
      {t.refresh}
    </button>
  </section>;
}
