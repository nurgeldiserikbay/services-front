import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dictionary, isLocale } from '@/lib/i18n';
import { searchPublicMarketplace, type SearchItem, type SearchScope } from '@/lib/api';
import { GeographyPicker } from '@/components/GeographyPicker';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; scope?: string; country_id?: string; city_id?: string }>;
};

export default async function Marketplace({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dictionary[locale];
  const { q: rawQ, scope: rawScope, country_id: rawCountryId, city_id: rawCityId } = await searchParams;
  const q = typeof rawQ === 'string' ? rawQ.slice(0, 180).trim() : '';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const countryId = typeof rawCountryId === 'string' && uuid.test(rawCountryId) ? rawCountryId : '';
  const cityId = countryId && typeof rawCityId === 'string' && uuid.test(rawCityId) ? rawCityId : '';
  const scope: SearchScope = rawScope === 'city' && cityId ? 'city' :
    rawScope === 'country' && countryId ? 'country' : 'global';
  let items: SearchItem[] = [];
  let error = false;
  if (q) {
    try {
      const result = await searchPublicMarketplace(q, scope, {countryId, cityId});
      items = result.items;
    } catch {
      error = true;
    }
  }
  const localeLink = (next: 'kk' | 'ru') => {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    query.set('scope', scope);
    if (countryId) query.set('country_id', countryId);
    if (cityId) query.set('city_id', cityId);
    const suffix = query.size ? '?' + query.toString() : '';
    return '/' + next + suffix;
  };
  return (
    <main className="shell">
      <header className="header">
        <Link className="brand" href={'/' + locale}>{t.brand}<span className="brandDot">.</span></Link>
        <nav className="language" aria-label="Language">
          <Link href={localeLink('kk')} aria-current={locale === 'kk' ? 'page' : undefined}>ҚАЗ</Link>
          <Link href={localeLink('ru')} aria-current={locale === 'ru' ? 'page' : undefined}>РУС</Link>
        </nav>
      </header>
      <section className="hero" aria-labelledby="headline">
        <p className="eyebrow">SERVICES / DISCOVERY</p>
        <h1 id="headline">{t.title}</h1>
        <p className="intro">{t.intro}</p>
        <form className="searchForm" action={'/' + locale} method="get">
          <label htmlFor="query">{t.searchLabel}</label>
          <div className="searchRow">
            <input autoComplete="off" id="query" name="q" placeholder={t.searchPlaceholder} maxLength={180} defaultValue={q} />
            <button type="submit">{t.search}</button>
          </div>
          <GeographyPicker locale={locale} initialCountryId={countryId}
            initialCityId={cityId} initialScope={scope} />
        </form>
      </section>
      <section className="results" aria-labelledby="results-title">
        <h2 id="results-title">{t.results}</h2>
        {!q && <p className="message">{t.waiting}</p>}
        {q && error && <p role="status" className="message">{t.unavailable}</p>}
        {q && !error && items.length === 0 && <p className="message">{t.empty}</p>}
        {q && !error && items.length > 0 &&
          <ul className="resultList">{items.map(item => (
            <li key={item.kind + ':' + item.id} className="resultItem">
              <strong>{item.title}</strong><small>{t.resultKinds[item.kind]}</small>
              {item.is_sponsored && <span className="sponsored">{t.sponsored}</span>}
            </li>
          ))}</ul>}
      </section>
      <footer>{t.footer}</footer>
    </main>
  );
}
