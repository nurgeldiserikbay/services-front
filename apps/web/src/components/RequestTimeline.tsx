import {buildRequestTimeline,type RequestState} from '@/lib/request-timeline';
import styles from './RequestTimeline.module.css';

/** Status must be read from the backend; do not assume a proposed time is booked. */
export function RequestTimeline({
  state,locale,
}:{
  state:RequestState;
  locale:'kk'|'ru';
}) {
  const timeline=buildRequestTimeline(state,locale);
  return <section className={styles.wrap} aria-label={locale==='kk'?'Өтінім күйі':'Статус заявки'}>
    <p className={styles.status} role="status">{timeline.status}</p>
    <ol className={styles.steps}>
      {timeline.steps.map(step=><li key={step.key} className={step.complete?styles.done:styles.waiting}>
        <span aria-hidden="true">{step.complete?'✓':'○'}</span>
        <span>{step.label}</span>
      </li>)}
    </ol>
  </section>;
}
