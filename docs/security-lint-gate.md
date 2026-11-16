# Frontend security lint gate

Run `pnpm lint` from the workspace root, or `pnpm --filter @services/web lint` for the web app. The command now runs both the security regex gate and a TypeScript compiler AST quality gate. Both scan `apps/web/src` by default.

The **security lint** fails on:

- dynamic `eval(...)` / `Function(...)` invocation;
- React `dangerouslySetInnerHTML` and direct `.innerHTML = ...` assignment;
- browser `localStorage.setItem` / `sessionStorage.setItem` (never store session capabilities or credentials there);
- `NODE_TLS_REJECT_UNAUTHORIZED=0` in application source.

Tests exercise positive and negative fixtures by passing a temporary directory to the script. Diagnostics identify source file, line, and rule. CI runs lint after frozen dependency installation, before unit tests.

The **TypeScript AST lint** (`apps/web/scripts/lint-ast.mjs`) additionally rejects `debugger` statements, `@ts-ignore` / `@ts-nocheck` suppression directives and parse diagnostics across TypeScript, TSX and JavaScript sources. It also recognizes straightforward computed-property forms of dynamic execution, browser-storage writes and direct HTML assignment (for example `window['eval'](...)`, `localStorage['setItem'](...)`, `element['innerHTML'] = ...`). Its fixture tests cover allowed TS/TSX and rejected constructs. The checker uses the project's existing TypeScript dependency without a new lockfile package.

**Limitations:** These are focused guards, **not** ESLint, a type-aware security audit, an XSS sanitizer, or a proof that all security-critical operations are safe. It cannot detect aliases, computed properties, obfuscated expressions, or other indirect uses, and may match strings/comments. Broad semantic JavaScript/React/Next.js linting and real-browser accessibility acceptance are still separate checklist gates. Do not mark the master `Frontend lint` acceptance item verified solely from this guard.
