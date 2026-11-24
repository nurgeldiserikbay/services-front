import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=readFileSync(new URL('../src/app/layout.tsx',import.meta.url),'utf8');
const sync=readFileSync(new URL('../src/components/LocaleDocumentLanguage.tsx',import.meta.url),'utf8');

test('root layout retains correct SSR document language and mounts client route sync',()=>{
 assert.match(root,/<html lang=\{documentLanguage\}>/);
 assert.match(root,/LocaleDocumentLanguage initialLocale=\{documentLanguage\}/);
 assert.match(root,/requestHeaders\.get\('x-services-locale'\)/);
});
test('client-side locale switch also updates html lang and translated skip link',()=>{
 assert.match(sync,/usePathname\(\)/);
 assert.match(sync,/segment==='ru'\?'ru':segment==='kk'\?'kk':initialLocale/);
 assert.match(sync,/document\.documentElement\.lang=locale;/);
 assert.match(sync,/\},\[locale\]\);/);
 assert.match(sync,/className="skipLink" href="#main-content"/);
 assert.match(sync,/locale==='ru'\?'Перейти к содержимому':'Негізгі мазмұнға өту'/);
});
