/**
 * Pure, localized presentation rules. Only server-authoritative request states
 * may appear in a timeline; a submitted inquiry is NOT a confirmed appointment.
 */
export type RequestState=
  'pending'|'accepted'|'declined'|'cancelled_by_customer'|
  'cancelled_by_provider'|'cancelled_mutual'|'completed'|'expired';
export type RequestTimelineStep={key:'submitted'|'accepted'|'resolved';label:string;complete:boolean};

const labels={
  kk:{
    submitted:'Өтінім қабылданды',accepted:'Орындаушы қабылдады',
    resolved:'Нәтиже',pending:'Орындаушы жауабын күтуде',
    declined:'Орындаушы бас тартты',cancelled:'Өтінім тоқтатылды',
    completed:'Қызмет орындалды',expired:'Өтінімнің мерзімі аяқталды',
  },
  ru:{
    submitted:'Заявка получена',accepted:'Исполнитель принял',
    resolved:'Результат',pending:'Ожидает ответа исполнителя',
    declined:'Исполнитель отклонил',cancelled:'Заявка отменена',
    completed:'Услуга выполнена',expired:'Срок заявки истёк',
  },
} as const;
export function buildRequestTimeline(
  state:RequestState,
  locale:'kk'|'ru',
):{steps:RequestTimelineStep[];status:string}{
  const t=labels[locale];
  const accepted=['accepted','completed','cancelled_by_customer','cancelled_by_provider','cancelled_mutual'].includes(state);
  const resolved=['declined','completed','expired','cancelled_by_customer','cancelled_by_provider','cancelled_mutual'].includes(state);
  const status=state==='pending'?t.pending:
    state==='accepted'?t.accepted:
    state==='declined'?t.declined:
    state==='completed'?t.completed:
    state==='expired'?t.expired:t.cancelled;
  return {
    steps:[
      {key:'submitted',label:t.submitted,complete:true},
      {key:'accepted',label:t.accepted,complete:accepted},
      {key:'resolved',label:t.resolved,complete:resolved},
    ],
    status,
  };
}
