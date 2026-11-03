'use client';

import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {
  mayOfferSellerDecision,sortSellerRequests,
  type SellerRequestSummary,
} from '@/lib/seller-requests';
import styles from './SellerRequestList.module.css';

type Decision='accept'|'decline';
type Result='ok'|'conflict'|'forbidden'|'unavailable';
const copy={
  kk:{
    heading:'Өтінімдер',empty:'Әзірге өтінім жоқ',accept:'Қабылдау',
    decline:'Бас тарту',pending:'Күтуде',accepted:'Қабылданды',
    declined:'Қабылданбады',other:'Аяқталған немесе тоқтатылған',
    error:'Әрекет орындалмады. Қайта жүктеп көріңіз.',
    conflict:'Өтінім күйі өзгерді. Тізімді жаңартыңыз.',
    notice:'Қабылдау уақытты автоматты түрде растамайды.',
  },
  ru:{
    heading:'Заявки',empty:'Заявок пока нет',accept:'Принять',
    decline:'Отклонить',pending:'Ожидает',accepted:'Принята',
    declined:'Отклонена',other:'Завершена или отменена',
    error:'Не удалось выполнить действие. Обновите страницу.',
    conflict:'Состояние заявки изменилось. Обновите список.',
    notice:'Принятие не означает подтверждения времени.',
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
  const [errors,setErrors]=useState<Record<string,string>>({});
  const inFlight=useRef(new Set<string>());
  async function decide(req:SellerRequestSummary,decision:Decision){
    if(inFlight.current.has(req.id) || !mayOfferSellerDecision(req,sellerContext))return;
    inFlight.current.add(req.id);setBusy(req.id);
    setErrors(prev=>({...prev,[req.id]:''}));
    try{
      const result=await onDecision(req.id,req.version,decision);
      // The caller MUST refresh the actual server state after success.
      if(result!=='ok')setErrors(prev=>({
        ...prev,[req.id]:result==='conflict'?t.conflict:t.error,
      }));
    }catch{
      setErrors(prev=>({...prev,[req.id]:t.error}));
    }finally{inFlight.current.delete(req.id);setBusy(null);}
  }
  const rows=sortSellerRequests(requests);
  return <section className={styles.wrap} aria-label={t.heading}>
    <h2>{t.heading}</h2>
    <p>{t.notice}</p>
    {rows.length===0?<p role="status">{t.empty}</p>:
      <ul className={styles.list}>{rows.map(req=><li key={req.id} className={styles.item}>
        <div><strong>{req.title}</strong><small>{req.createdAt.slice(0,10)}</small></div>
        <span>{req.state==='pending'?t.pending:req.state==='accepted'?t.accepted:
          req.state==='declined'?t.declined:t.other}</span>
        {mayOfferSellerDecision(req,sellerContext)&&<div className={styles.actions}>
          <button type="button" onClick={()=>void decide(req,'accept')}
            disabled={busy===req.id}>{t.accept}</button>
          <button type="button" onClick={()=>void decide(req,'decline')}
            disabled={busy===req.id}>{t.decline}</button>
        </div>}
        {errors[req.id]&&<p role="alert">{errors[req.id]}</p>}
      </li>)}</ul>}
  </section>;
}
