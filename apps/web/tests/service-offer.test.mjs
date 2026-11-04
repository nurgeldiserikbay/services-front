import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('the public offer reader requests only server-side public data',()=>{
 const text=readFileSync(new URL('../src/lib/public-offer.ts',import.meta.url),'utf8');
 assert.match(text,/server-only/);
 assert.match(text,/cache:'no-store'/);
 assert.doesNotMatch(text,/Guest-Capability:|Authorization:|Cookie:/);
});
test('public offer page never invents a phone or WhatsApp deep link',()=>{
 const text=readFileSync(new URL('../src/app/[locale]/services/[id]/page.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(text,/wa\.me|tel:|rawContacts|contacts\.phone|ownerPersonId/);
 assert.match(text,/offer\.contact_methods/);
});

test('public offer fetch is bounded and strips unexpected backend fields',()=>{
 const text=readFileSync(new URL('../src/lib/public-offer.ts',import.meta.url),'utf8');
 assert.match(text,/AbortSignal\.timeout\(5000\)/);
 assert.match(text,/data\.id\.toLowerCase\(\)!==id\.toLowerCase\(\)/);
 assert.match(text,/new Set\(o\.contact_methods\)\.size/);
 assert.match(text,/contact_methods:\[\.\.\.data\.contact_methods\]/);
 assert.doesNotMatch(text,/return data;/);
});
