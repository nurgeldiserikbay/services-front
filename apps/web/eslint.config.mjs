import {defineConfig,globalIgnores} from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

// Next.js 16 flat config: enforce React, hooks, accessibility, Core Web Vitals,
// and TypeScript recommended rules on the application source.
export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores(['.next/**','out/**','build/**','next-env.d.ts','node_modules/**']),
]);
