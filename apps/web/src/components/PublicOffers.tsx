import Link from 'next/link';
import type { PublicOffer } from '@/lib/api';
import type { Locale } from '@/lib/i18n';

const labels={
  kk:{heading:'Қызметтер',empty:'Қазір жарияланған қызмет жоқ',price:'Көрсетілген баға',modes:{online:'Онлайн',at_location:'Қызмет орнында',at_customer:'Клиент мекенжайында',hybrid:'Аралас'}},
  ru:{heading:'Услуги',empty:'Пока нет опубликованных услуг',price:'Указанная стоимость',modes:{online:'Онлайн',at_location:'На месте',at_customer:'У клиента',hybrid:'Смешанный'}},
} as const;

export function PublicOffers({offers,locale}:{offers:PublicOffer[];locale:Locale}) {
  const t=labels[locale];
  return <section className="publicOffers" aria-labelledby="public-offers-heading">
    <h2 id="public-offers-heading">{t.heading}</h2>
    {offers.length===0?<p className="message">{t.empty}</p>:
      <ul className="resultList">{offers.map(offer=>
        <li key={offer.id} className="resultItem">
          <Link className="resultLink" href={`/${locale}/services/${encodeURIComponent(offer.id)}`}>{offer.title}</Link>
          <small>{t.modes[offer.delivery_mode]}</small>
          {offer.price_label&&<span>{t.price}: {offer.price_label}</span>}
        </li>)}</ul>}
  </section>;
}
