import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('seller decision callback failures never log raw exception objects',()=>{
  const source=readFileSync(
    new URL('../src/components/SellerDecisionActions.tsx',import.meta.url),'utf8',
  );
  assert.match(source,/Seller decision committed, but parent update failed/);
  // The callback can throw user-controlled or private account/request details.
  // Keep a stable diagnostic message, never pass the thrown exception to logs.
  assert.doesNotMatch(source,/console\.(?:error|warn|log)\s*\([^;]*,\s*(?:error|err|exception)\b/s);
});
