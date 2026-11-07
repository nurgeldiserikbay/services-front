import type {Locale} from '@/lib/i18n';
import styles from './SellerInboxList.module.css';
import {SellerDecisionActions} from './SellerDecisionActions';

export type SellerInboxEntry={
  id:string;service_offer_id:string;title:string;
  state:'pending'|'accepted'|'declined'|'cancelled_by_customer'|
    'cancelled_by_provider'|'cancelled_mutual'|'completed'|'expired';
  version:number;seller_kind:'professional'|'organization';seller_id:string;
  created_at:string;scheduled_start_at:string|null;
};

const labels={
  kk:{heading:'Келген өтінімдер',empty:'Әзірге өтінім жоқ',
    professional:'Маман',organization:'Компания',created:'Жіберілген',
    scheduled:'Сұралған уақыт',pending:'Күтуде',accepted:'Қабылданды',
    declined:'Қабылданбады',completed:'Аяқталды',expired:'Мерзімі өтті',
    cancelled_by_customer:'Клиент болдырмады',
    cancelled_by_provider:'Орындаушы болдырмады',
    cancelled_mutual:'Екі жақ болдырмады',notice:'Сұралған уақыт әлі расталған жазылу емес.'},
  ru:{heading:'Входящие заявки',empty:'Заявок пока нет',
    professional:'Специалист',organization:'Компания',created:'Отправлена',
    scheduled:'Запрошенное время',pending:'Ожидает',accepted:'Принята',
    declined:'Отклонена',completed:'Завершена',expired:'Истекла',
    cancelled_by_customer:'Отменена клиентом',
    cancelled_by_provider:'Отменена исполнителем',
    cancelled_mutual:'Отменена обеими сторонами',
    notice:'Запрошенное время ещё не является подтверждённой записью.'},
} as const;

/** Presentation only. Mount after server-side authentication and strict parsing. */
export function SellerInboxList({locale,items,onDecision,onSuccess}:{
  locale:Locale;items:readonly SellerInboxEntry[];
  onDecision?:(requestId:string,action:'accept'|'decline',version:number,key:string)=>
    Promise<{id:string;state:'accepted'|'declined';version:number;replayed:boolean}>;
  onSuccess?:(requestId:string,result:{id:string;state:'accepted'|'declined';version:number;replayed:boolean})=>void;
}){
  const t=labels[locale];
  const formatter=new Intl.DateTimeFormat(locale==='kk'?'kk-KZ':'ru-RU',{

    dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Almaty',
  });
  const format=(iso:string)=>formatter.format(new Date(iso));
  return <section className={styles.section} aria-label={t.heading}>
    <h2>{t.heading}</h2>
    {items.length===0?<p>{t.empty}</p>:<ul className={styles.list}>
      {items.map(item=><li key={item.id} className={styles.item}>
        <div className={styles.top}>
          <strong>{item.title}</strong>
          <span className={styles.status} data-state={item.state}>{t[item.state]}</span>
        </div>
        <small>{t[item.seller_kind]} · {t.created}: {format(item.created_at)}</small>
        {item.scheduled_start_at&&<p>{t.scheduled}: <time dateTime={item.scheduled_start_at}>
          {format(item.scheduled_start_at)}</time></p>}
        {item.scheduled_start_at&&<small>{t.notice}</small>}
        {item.state==='pending'&&onDecision&&onSuccess&&
          <SellerDecisionActions key={item.id+':'+item.version} locale={locale}
            requestId={item.id} version={item.version} onDecision={onDecision}
            onSuccess={result=>onSuccess(item.id,result)}/>}
      </li>)}
    </ul>}
  </section>;
}
