import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dictionary, isLocale } from '@/lib/i18n';
import { getPublicProfessions, searchPublicMarketplace, type SearchDeliveryMode, type SearchItem, type SearchScope } from '@/lib/api';
import { GeographyPicker } from '@/components/GeographyPicker';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; scope?: string; country_id?: string; city_id?: string; profession_id?: string; delivery_mode?: string; cursor?: string }>;
};

export default async function Marketplace({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dictionary[locale];
  const { q: rawQ, scope: rawScope, country_id: rawCountryId, city_id: rawCityId, profession_id: rawProfessionId, delivery_mode: rawDeliveryMode, cursor: rawCursor } = await searchParams;
  const q = typeof rawQ === 'string' ? rawQ.slice(0, 180).trim() : '';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const countryId = typeof rawCountryId === 'string' && uuid.test(rawCountryId) ? rawCountryId : '';
  const cityId = countryId && typeof rawCityId === 'string' && uuid.test(rawCityId) ? rawCityId : '';
  const professionId = typeof rawProfessionId === 'string' && uuid.test(rawProfessionId) ? rawProfessionId.toLowerCase() : '';
  const deliveryMode: SearchDeliveryMode = rawDeliveryMode === 'at_location' || rawDeliveryMode === 'at_customer' || rawDeliveryMode === 'online' ? rawDeliveryMode : 'any';
  const scope: SearchScope = rawScope === 'city' && cityId ? 'city' :
    rawScope === 'country' && countryId ? 'country' : 'global';
  const cursor = typeof rawCursor === 'string' && rawCursor.length <= 512 && /^[A-Za-z0-9_-]+$/.test(rawCursor) ? rawCursor : '';
  let professions: Awaited<ReturnType<typeof getPublicProfessions>> = [];
  try { professions = await getPublicProfessions(); } catch { /* Keep search usable when taxonomy is unavailable. */ }
  let nextCursor: string | null = null;
  let items: SearchItem[] = [];
  let error = false;
  if (q) {
    try {
      const result = await searchPublicMarketplace(q, scope, {countryId, cityId}, undefined, cursor, professionId || undefined, deliveryMode);
      items = result.items;
      nextCursor = result.next_cursor;
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
    if (professionId) query.set('profession_id', professionId);
    if (deliveryMode !== 'any') query.set('delivery_mode', deliveryMode);
    if (cursor) query.set('cursor', cursor);
    const suffix = query.size ? '?' + query.toString() : '';
    return '/' + next + suffix;
  };
  const pageLink = (next: string) => {
    const query = new URLSearchParams();
    query.set('q', q);
    query.set('scope', scope);
    if (scope === 'country' && countryId) query.set('country_id', countryId);
    if (scope === 'city' && cityId) {
      query.set('city_id', cityId);
      if (countryId) query.set('country_id', countryId); // UI context; API sends only city_id.
    }
    if (professionId) query.set('profession_id', professionId);
    if (deliveryMode !== 'any') query.set('delivery_mode', deliveryMode);
    if (next) query.set('cursor', next);
    return '/' + locale + '?' + query.toString();
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
          <label htmlFor="profession_id">{t.professionFilter}</label>
          <select id="profession_id" name="profession_id" defaultValue={professionId}>
            <option value="">{t.allProfessions}</option>
            {professions.map(profession => <option key={profession.id} value={profession.id}>{profession.name}</option>)}
          </select>
          <label htmlFor="delivery_mode">{t.deliveryFilter}</label>
          <select id="delivery_mode" name="delivery_mode" defaultValue={deliveryMode}>
            <option value="any">{t.anyDelivery}</option>
            <option value="at_location">{t.atLocation}</option>
            <option value="at_customer">{t.atCustomer}</option>
            <option value="online">{t.onlineDelivery}</option>
          </select>
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
              {item.kind === 'professional' && item.slug ?
                <Link className="resultLink" href={`/${locale}/professionals/${encodeURIComponent(item.slug)}`}>{item.title}</Link> :
                item.kind === 'organization' ?
                <Link className="resultLink" href={`/${locale}/organizations/${encodeURIComponent(item.id)}`}>{item.title}</Link> :
                item.kind === 'offer' ?
                <Link className="resultLink" href={`/${locale}/services/${encodeURIComponent(item.id)}`}>{item.title}</Link> :
                <strong>{item.title}</strong>}
              <small>{t.resultKinds[item.kind]}</small>
              {item.is_sponsored && <span className="sponsored">{t.sponsored}</span>}
            </li>
          ))}</ul>}
        {q && !error && nextCursor && <nav aria-label={t.pagination} className="pagination">
          <Link href={pageLink(nextCursor)}>{t.nextPage}</Link>
        </nav>}
      </section>
      <footer>{t.footer}</footer>
    </main>
  );
}
