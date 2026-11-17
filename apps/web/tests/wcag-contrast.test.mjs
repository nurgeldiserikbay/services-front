import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const styles=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');
const variable=name=>{
  const token=styles.match(new RegExp('--'+name+':(#[0-9a-fA-F]{6})'));
  assert.ok(token,'Missing color token '+name);
  return token[1];
};
const luminance=hex=>{
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const linear=rgb.map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
};
const contrast=(a,b)=>{
  const high=Math.max(luminance(a),luminance(b));
  const low=Math.min(luminance(a),luminance(b));
  return (high+0.05)/(low+0.05);
};

test('active locale link meets WCAG AA text contrast on selected background',()=>{
  const background=styles.match(/\.language a\[aria-current=page\]\{background:(#[0-9a-fA-F]{6})/);
  assert.ok(background,'Selected locale background must be explicit');
  const ratio=contrast(variable('accent'),background[1]);
  assert.ok(ratio>=4.5,'Active locale link text must reach 4.5:1; actual '+ratio);
});

test('empty, loading and error status text meets WCAG AA on message background',()=>{
  const ratio=contrast(variable('muted'),variable('pale'));
  assert.ok(ratio>=4.5,'Informational status text must reach 4.5:1; actual '+ratio);
});
