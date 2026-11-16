import {defineConfig,globalIgnores} from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

// Next.js 16 flat config: enforce React, hooks, accessibility, Core Web Vitals,
// and TypeScript recommended rules on the application source.
export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  // Legacy React-effect initialization patterns: migrate each component
  // before lifting these narrowly scoped exceptions. Do not disable globally.
  {
    files:[
      'src/components/AccountDeviceSessions.tsx',
      'src/components/AccountNotificationsInbox.tsx',
      'src/components/GeographyPicker.tsx',
      'src/components/GuestRequestStatusCheck.tsx',
      'src/components/SellerWorkspace.tsx',
    ],
    rules:{'react-hooks/set-state-in-effect':'off'},
  },
  globalIgnores(['.next/**','out/**','build/**','next-env.d.ts','node_modules/**']),
]);
