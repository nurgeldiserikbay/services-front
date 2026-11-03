import type {Locale} from '@/lib/i18n';
import type {RequestReceipt} from '@/lib/request-receipt';
import styles from './GuestRequestReceipt.module.css';

const copy={
  kk:{
    heading:'Өтінім қабылданды',id:'Өтінім нөмірі',
    note:'Орындаушы жауап бергенше күтіңіз. Өтінім қабылдануы қызмет уақыты расталғанын білдірмейді.',
    privacy:'Өтінімге қайта кіру үшін қауіпсіз растау арнасын қолданыңыз.',
  },
  ru:{
    heading:'Заявка получена',id:'Номер заявки',
    note:'Ожидайте ответа исполнителя. Принятие заявки не подтверждает время оказания услуги.',
    privacy:'Для повторного доступа используйте защищённый способ подтверждения.',
  },
} as const;

/** Never renders a guest capability, raw phone or OTP. Not publicly mounted. */
export function GuestRequestReceipt({locale,receipt}:{
  locale:Locale;receipt:RequestReceipt;
}){
  const t=copy[locale];
  return <section className={styles.receipt} aria-label={t.heading}>
    <h2>{t.heading}</h2>
    <p>{t.id}: <strong>{receipt.id}</strong></p>
    <p role="status">{receipt.state==='pending'?(locale==='kk'?'Орындаушы жауабын күтуде':'Ожидает ответа исполнителя'):(locale==='kk'?'Өтінім күйі: ':'Статус заявки: ')+receipt.state}</p>
    <p>{t.note}</p><small>{t.privacy}</small>
  </section>;
}
