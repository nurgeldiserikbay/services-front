import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dictionary, isLocale } from '@/lib/i18n';
import { getPublicProfessions, searchPublicMarketplace, type SearchItem, type SearchScope } from '@/lib/api';
import { GeographyPicker } from '@/components/GeographyPicker';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; scope?: string; country_id?: string; city_id?: string; profession_id?: string; cursor?: string }>;
};

export default async function Marketplace({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dictionary[locale];
  const { q: rawQ, scope: rawScope, country_id: rawCountryId, city_id: rawCityId, profession_id: rawProfessionId, cursor: rawCursor } = await searchParams;
  const q = typeof rawQ === 'string' ? rawQ.slice(0, 180).trim() : '';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const countryId = typeof rawCountryId === 'string' && uuid.test(rawCountryId) ? rawCountryId : '';
  const cityId = countryId && typeof rawCityId === 'string' && uuid.test(rawCityId) ? rawCityId : '';
  const professionId = typeof rawProfessionId === 'string' && uuid.test(rawProfessionId) ? rawProfessionId.toLowerCase() : '';
  const scope: SearchScope = rawScope === 'city' && cityId ? 'city' :
    rawScope === 'country' && countryId ? 'country' : 'global';
  const cursor = typeof rawCursor === 'string' && rawCursor.length <= 512 && /^[A-Za-z0-9_-]+$/.test(rawCursor) ? rawCursor : '';
  const [professionDirectory, search] = await Promise.all([
    getPublicProfessions()
      .then(items => ({items, error: false}))
      .catch(() => ({items: [], error: true})),
    q
      ? searchPublicMarketplace(q, scope, {countryId, cityId}, undefined, cursor, professionId || undefined)
          .then(result => ({result, error: false}))
          .catch(() => ({result: null, error: true}))
      : Promise.resolve({result: null, error: false}),
  ]);
  const professionOptions = professionDirectory.items;
  const hasSelectedProfession = professionOptions.some(item => item.id === professionId);
  const items: SearchItem[] = search.result?.items ?? [];
  const nextCursor: string | null = search.result?.next_cursor ?? null;
  const error = search.error;
  const localeLink = (next: 'kk' | 'ru') => {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    query.set('scope', scope);
    if (countryId) query.set('country_id', countryId);
    if (cityId) query.set('city_id', cityId);
    if (professionId) query.set('profession_id', professionId);
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
          {professionOptions.length > 0 ? (
            <fieldset className="professionPicker">
              <legend>{t.profession}</legend>
              <select id="profession_id" name="profession_id" defaultValue={hasSelectedProfession ? professionId : ''}>
                <option value="">{t.allProfessions}</option>
                {professionOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </fieldset>
          ) : (
            <>
              {professionId && <input type="hidden" name="profession_id" value={professionId} />}
              {professionDirectory.error && <p role="status" className="professionError">{t.professionsUnavailable}</p>}
            </>
          )}
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
