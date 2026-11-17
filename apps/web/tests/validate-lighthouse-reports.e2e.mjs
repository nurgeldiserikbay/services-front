import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

const locales=['kk','ru'];
const summary={
  schemaVersion:1,
  kind:'lighthouse-mobile-ci-lab-audit',
  warning:'CI mobile simulation, not field Core Web Vitals, physical-device or production SLO evidence. PWA offline acceptance has a separate browser gate.',
  pages:[],
};
for(const locale of locales){
  const report=JSON.parse(await readFile('artifacts/lighthouse-'+locale+'-mobile.json','utf8'));
  const expectedUrl='http://127.0.0.1:3000/'+locale;
  assert.equal(new URL(report.finalDisplayedUrl).pathname,'/'+locale,'Lighthouse must audit correct locale');
  assert.equal(new URL(report.finalDisplayedUrl).origin,new URL(expectedUrl).origin);
  assert.ok(report.lighthouseVersion,'Lighthouse version required');
  assert.ok(report.configSettings?.formFactor==='mobile','mobile form factor required');
  const categories={};
  for(const name of ['performance','accessibility','best-practices','seo']){
    const category=report.categories?.[name];
    assert.ok(category&&Number.isFinite(category.score)&&category.score>=0&&category.score<=1,
      locale+' missing Lighthouse '+name+' score');
    categories[name]=Math.round(category.score*100);
  }
  const metrics={};
  for(const [name,key] of [
    ['firstContentfulPaintMs','first-contentful-paint'],
    ['largestContentfulPaintMs','largest-contentful-paint'],
    ['speedIndexMs','speed-index'],
    ['totalBlockingTimeMs','total-blocking-time'],
    ['cumulativeLayoutShift','cumulative-layout-shift'],
  ]){
    const value=report.audits?.[key]?.numericValue;
    assert.ok(typeof value==='number'&&Number.isFinite(value)&&value>=0,
      locale+' missing Lighthouse '+key);
    metrics[name]=value;
  }
  summary.pages.push({locale,url:expectedUrl,categories,metrics});
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/lighthouse-mobile-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log('[lighthouse] '+JSON.stringify(summary));
