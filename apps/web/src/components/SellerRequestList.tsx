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
type Result='ok'|'conflict'|'forbidden'|'unauthorized'|'unavailable';
const filters:readonly SellerInboxFilter[]=['all','pending','accepted','closed'];
const copy={
  kk:{
    heading:'Өтінімдер',empty:'Әзірге өтінім жоқ',accept:'Қабылдау',
    decline:'Бас тарту',pending:'Күтуде',accepted:'Қабылданды',
    declined:'Қабылданбады',other:'Аяқталған немесе тоқтатылған',
    error:'Әрекет орындалмады. Қайта жүктеп көріңіз.',
    conflict:'Өтінім күйі өзгерді. Тізімді жаңартыңыз.',
    forbidden:'Бұл өтінімді өзгертуге рұқсатыңыз жоқ.',
    unauthorized:'Сессия аяқталды. Аккаунтқа қайта кіріңіз.',
    notice:'Қабылдау уақытты автоматты түрде растамайды.',
    filters:{all:'Барлығы',pending:'Жаңа',accepted:'Қабылданған',closed:'Жабылған'},
    noFilter:'Бұл сүзгіде өтінім жоқ',working:'Әрекет орындалып жатыр…',
    refresh:'Жаңарту',refreshing:'Тізім жаңартылып жатыр…',
  },
  ru:{
    heading:'Заявки',empty:'Заявок пока нет',accept:'Принять',
    decline:'Отклонить',pending:'Ожидает',accepted:'Принята',
    declined:'Отклонена',other:'Завершена или отменена',
    error:'Не удалось выполнить действие. Обновите страницу.',
    conflict:'Состояние заявки изменилось. Обновите список.',
    forbidden:'Недостаточно прав для изменения этой заявки.',
    unauthorized:'Сессия завершилась. Войдите в аккаунт снова.',
    notice:'Принятие не означает подтверждения времени.',
    filters:{all:'Все',pending:'Новые',accepted:'Принятые',closed:'Закрытые'},
    noFilter:'В этом разделе заявок нет',working:'Выполняется действие…',
    refresh:'Обновить',refreshing:'Обновляем список заявок…',
  },
} as const;

/**
 * Backend-authenticated caller supplies data filtered to the actual seller
 * and a mutation function that verifies membership, ACL and idempotency.
 * This component is deliberately not mounted on public pages.
 */
export function SellerRequestList({
  locale,requests,sellerContext,onDecision,onRefresh,
}:{
  locale:Locale;
  requests:readonly SellerRequestSummary[];
  sellerContext:'professional'|'organization';
  onDecision:(id:string,version:number,decision:Decision)=>Promise<Result>;
  /** Caller re-fetches only its authenticated seller scope, never a public API. */
  onRefresh?:()=>Promise<void>;
}){
  const t=copy[locale];
  const [busy,setBusy]=useState<string|null>(null);
  const [refreshing,setRefreshing]=useState(false);
  const refreshLock=useRef(false);
  const [filter,setFilter]=useState<SellerInboxFilter>('all');
  const [settled,setSettled]=useState<Record<string,number>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const inFlight=useRef(new Set<string>());
  async function refresh(){
    if(!onRefresh||refreshLock.current)return;
    refreshLock.current=true;setRefreshing(true);
    try{
      await onRefresh();
      setErrors(prev=>({...prev,__refresh:''}));
    }catch{
      setErrors(prev=>({...prev,__refresh:t.error}));
    }
    finally{refreshLock.current=false;setRefreshing(false);}
  }
  async function decide(req:SellerRequestSummary,decision:Decision){
    if(refreshLock.current||inFlight.current.has(req.id)||settled[req.id]===req.version||
       !mayOfferSellerDecision(req,sellerContext))return;
    inFlight.current.add(req.id);setBusy(req.id);
    setErrors(prev=>({...prev,[req.id]:''}));
    try{
      const result=await onDecision(req.id,req.version,decision);
      // The caller MUST refresh the actual server state after success.
      // Guard stale props from allowing another decision before that refresh.
      if(result==='ok'||result==='conflict'||result==='forbidden'||result==='unauthorized'){
        // Never allow another decision against an unverified old version.
        setSettled(prev=>({...prev,[req.id]:req.version}));
        // A failed refresh must be visible; the request stays locked until a
        // later server snapshot changes its version.
        await refresh();
      }
      if(result!=='ok')setErrors(prev=>({
        ...prev,[req.id]:result==='conflict'?t.conflict:result==='forbidden'?t.forbidden:result==='unauthorized'?t.unauthorized:t.error,
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
    {onRefresh&&<button type="button" className={styles.refresh}
      onClick={()=>void refresh()} disabled={refreshing||busy!==null}>
      {refreshing?t.refreshing:t.refresh}
    </button>}
    {errors.__refresh&&<p role="alert">{errors.__refresh}</p>}
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
            disabled={refreshing||busy!==null||settled[req.id]===req.version}>{t.accept}</button>
          <button type="button" onClick={()=>void decide(req,'decline')}
            disabled={refreshing||busy!==null||settled[req.id]===req.version}>{t.decline}</button>
        </div>}
        {busy===req.id&&<p role="status">{t.working}</p>}
        {errors[req.id]&&<p role="alert">{errors[req.id]}</p>}
      </li>)}</ul>}
  </section>;
}
