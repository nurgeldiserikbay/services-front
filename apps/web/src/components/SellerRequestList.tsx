'use client';

import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {
  mayOfferSellerDecision,filterSellerRequests,countSellerInbox,
  type SellerInboxFilter,
  type SellerRequestSummary,
} from '@/lib/seller-requests';
import styles from './SellerRequestList.module.css';

type Decision='accept'|'decline';
type Result='ok'|'conflict'|'forbidden'|'unavailable';
const filters:readonly SellerInboxFilter[]=['all','pending','accepted','closed'];
const copy={
  kk:{
    heading:'Өтінімдер',empty:'Әзірге өтінім жоқ',accept:'Қабылдау',
    decline:'Бас тарту',pending:'Күтуде',accepted:'Қабылданды',
    declined:'Қабылданбады',other:'Аяқталған немесе тоқтатылған',
    error:'Әрекет орындалмады. Қайта жүктеп көріңіз.',
    conflict:'Өтінім күйі өзгерді. Тізімді жаңартыңыз.',
    notice:'Қабылдау уақытты автоматты түрде растамайды.',
    filters:{all:'Барлығы',pending:'Жаңа',accepted:'Қабылданған',closed:'Жабылған'},
    noFilter:'Бұл сүзгіде өтінім жоқ',working:'Әрекет орындалып жатыр…',
  },
  ru:{
    heading:'Заявки',empty:'Заявок пока нет',accept:'Принять',
    decline:'Отклонить',pending:'Ожидает',accepted:'Принята',
    declined:'Отклонена',other:'Завершена или отменена',
    error:'Не удалось выполнить действие. Обновите страницу.',
    conflict:'Состояние заявки изменилось. Обновите список.',
    notice:'Принятие не означает подтверждения времени.',
    filters:{all:'Все',pending:'Новые',accepted:'Принятые',closed:'Закрытые'},
    noFilter:'В этом разделе заявок нет',working:'Выполняется действие…',
  },
} as const;

/**
 * Backend-authenticated caller supplies data filtered to the actual seller
 * and a mutation function that verifies membership, ACL and idempotency.
 * This component is deliberately not mounted on public pages.
 */
export function SellerRequestList({
  locale,requests,sellerContext,onDecision,
}:{
  locale:Locale;
  requests:readonly SellerRequestSummary[];
  sellerContext:'professional'|'organization';
  onDecision:(id:string,version:number,decision:Decision)=>Promise<Result>;
}){
  const t=copy[locale];
  const [busy,setBusy]=useState<string|null>(null);
  const [filter,setFilter]=useState<SellerInboxFilter>('all');
  const [settled,setSettled]=useState<Set<string>>(()=>new Set());
  const [errors,setErrors]=useState<Record<string,string>>({});
  const inFlight=useRef(new Set<string>());
  async function decide(req:SellerRequestSummary,decision:Decision){
    if(inFlight.current.has(req.id)||settled.has(req.id)||
       !mayOfferSellerDecision(req,sellerContext))return;
    inFlight.current.add(req.id);setBusy(req.id);
    setErrors(prev=>({...prev,[req.id]:''}));
    try{
      const result=await onDecision(req.id,req.version,decision);
      // The caller MUST refresh the actual server state after success.
      // Guard stale props from allowing another decision before that refresh.
      if(result==='ok'||result==='conflict')setSettled(prev=>new Set(prev).add(req.id));
      if(result!=='ok')setErrors(prev=>({
        ...prev,[req.id]:result==='conflict'?t.conflict:t.error,
      }));
    }catch{
      setErrors(prev=>({...prev,[req.id]:t.error}));
    }finally{inFlight.current.delete(req.id);setBusy(null);}
  }
  const rows=filterSellerRequests(requests,sellerContext,filter);
  const counts=countSellerInbox(requests,sellerContext);
  return <section className={styles.wrap} aria-label={t.heading}>
    <h2>{t.heading}</h2>
    <p>{t.notice}</p>
    <div className={styles.filters} role="group" aria-label={t.heading}>
      {filters.map(value=><button key={value} type="button"
        aria-pressed={filter===value} onClick={()=>setFilter(value)}>
        {t.filters[value]} <span aria-hidden="true">{counts[value]}</span>
      </button>)}
    </div>
    {rows.length===0?<p role="status">{counts.all===0?t.empty:t.noFilter}</p>:
      <ul className={styles.list}>{rows.map(req=><li key={req.id} className={styles.item}>
        <div><strong>{req.title}</strong><small>{req.createdAt.slice(0,10)}</small></div>
        <span>{req.state==='pending'?t.pending:req.state==='accepted'?t.accepted:
          req.state==='declined'?t.declined:t.other}</span>
        {mayOfferSellerDecision(req,sellerContext)&&<div className={styles.actions}>
          <button type="button" onClick={()=>void decide(req,'accept')}
            disabled={busy===req.id||settled.has(req.id)}>{t.accept}</button>
          <button type="button" onClick={()=>void decide(req,'decline')}
            disabled={busy===req.id||settled.has(req.id)}>{t.decline}</button>
        </div>}
        {busy===req.id&&<p role="status">{t.working}</p>}
        {errors[req.id]&&<p role="alert">{errors[req.id]}</p>}
      </li>)}</ul>}
  </section>;
}
