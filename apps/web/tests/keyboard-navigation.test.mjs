import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const appDir=fileURLToPath(new URL('../src/app/',import.meta.url));
const layout=readFileSync(join(appDir,'layout.tsx'),'utf8');
const css=readFileSync(join(appDir,'globals.css'),'utf8');
function pages(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(item=>{
  const path=join(dir,item.name);
  return item.isDirectory()?pages(path):item.name==='page.tsx'?[path]:[];
});}

test('keyboard skip link is localized and visible on focus',()=>{
  assert.match(layout,/className="skipLink" href="#main-content"/);
  assert.match(layout,/Негізгі мазмұнға өту/);
  assert.match(layout,/Перейти к содержимому/);
  assert.match(css,/\.skipLink:focus-visible/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('every localized page main landmark has a skip target',()=>{
  for(const path of pages(appDir)){
    if(!path.includes('[locale]'))continue;
    const source=readFileSync(path,'utf8');
    const mains=[...source.matchAll(/<main\b[^>]*>/g)].map(x=>x[0]);
    assert.ok(mains.length>0,path+' has no main landmark');
    for(const main of mains)assert.match(main,/id="main-content"/,path+' lacks skip target');
  }
});


test('native filters and high contrast keyboard focus are visible',()=>{
  assert.match(css,/select:focus-visible,textarea:focus-visible/);
  assert.match(css,/@media\(forced-colors:active\)/);
  assert.match(css,/outline:2px solid Highlight/);
  assert.match(css,/\.resultLink\{text-decoration:underline\}/);
});


test('search field exposes native search keyboard and empty results are announced',()=>{
  const page=readFileSync(join(appDir,'[locale]','page.tsx'),'utf8');
  assert.match(page,/<form role="search" className="searchForm"/);
  assert.match(page,/<input type="search" enterKeyHint="search"[^>]*id="query"/);
  assert.match(page,/items\.length === 0 && <p role="status" className="message">/);
  assert.match(page,/q && error && <p role="status"/);
  assert.match(page,/id="query" aria-controls="results-list" aria-describedby="results-title"/);
  assert.match(page,/<section id="results-list" className="results" aria-labelledby="results-title"/);
});

test('geography retry uses native keyboard buttons and inherits visible focus styling',()=>{
  const geo=readFileSync(new URL('../src/components/GeographyPicker.tsx',import.meta.url),'utf8');
  assert.equal((geo.match(/<button type="button" onClick=\{\(\)=>set(?:Country|City)RequestVersion\(v=>v\+1\)\}/g)??[]).length,4);
  assert.match(css,/button:focus-visible,a:focus-visible,input:focus-visible/);
  assert.match(css,/\.geoError button\{min-height:44px;min-width:44px/);
  assert.doesNotMatch(geo,/onKeyDown=\{[^}]*preventDefault/);
});

test('search announces only the current page result count in both locales',()=>{
  const i18n=readFileSync(new URL('../src/lib/i18n.ts',import.meta.url),'utf8');
  const page=readFileSync(join(appDir,'[locale]','page.tsx'),'utf8');
  assert.match(i18n,/resultsOnPage: \(count: number\) => `Осы бетте \$\{count\} нәтиже`/);
  assert.match(i18n,/resultsOnPage: \(count: number\) => `На этой странице результатов: \$\{count\}`/);
  assert.match(page,/q && !error && items\.length > 0 && <p role="status" aria-live="polite">\{t\.resultsOnPage\(items\.length\)\}<\/p>/);
  assert.doesNotMatch(page,/resultsOnPage\(search\.result\?\.total/);
});

test('search filter dropdowns expose explicit localized accessible names',()=>{
  const page=readFileSync(join(appDir,'[locale]','page.tsx'),'utf8');
  assert.match(page,/<select id="profession_id" name="profession_id" aria-label=\{t\.profession\}/);
  assert.match(page,/<select id="delivery_mode" name="delivery_mode" aria-label=\{t\.deliveryFilter\}/);
});

test('reset-search link clears all query and filters without a scripting dependency',()=>{
  const page=readFileSync(join(appDir,'[locale]','page.tsx'),'utf8');
  const i18n=readFileSync(new URL('../src/lib/i18n.ts',import.meta.url),'utf8');
  assert.match(page,/const hasSearchFilters = Boolean\(q \|\| countryId \|\| cityId \|\| professionId \|\| deliveryMode !== 'any' \|\| cursor\)/);
  assert.match(page,/hasSearchFilters && <Link className="clearFilters" href=\{'\/' \+ locale\}>\{t\.clearFilters\}<\/Link>/);
  assert.match(i18n,/clearFilters: 'Іздеуді және сүзгілерді тазарту'/);
  assert.match(i18n,/clearFilters: 'Очистить поиск и фильтры'/);
  assert.match(css,/\.clearFilters\{display:inline-flex;align-items:center;min-height:44px/);
});

test('localized loading boundary retains keyboard skip target during streaming',()=>{
  const loading=readFileSync(join(appDir,'[locale]','loading.tsx'),'utf8');
  assert.match(loading,/<main id="main-content" className="shell publicDetail" aria-busy="true">/);
  assert.match(loading,/<p role="status" aria-live="polite"/);
  assert.match(loading,/useParams\(\)/);
  assert.match(loading,/dictionary\[locale\]\.loading/);
});

test('loading announcement follows kk and ru route instead of combining languages',()=>{
  const loading=readFileSync(join(appDir,'[locale]','loading.tsx'),'utf8');
  const i18n=readFileSync(new URL('../src/lib/i18n.ts',import.meta.url),'utf8');
  assert.match(i18n,/loading: 'Жүктелуде…'/);
  assert.match(i18n,/loading: 'Загрузка…'/);
  assert.doesNotMatch(loading,/Жүктелуде… · Загружаем…/);
  assert.match(loading,/isLocale\(rawLocale\)/);
});
