// Minimal ESLint flat config for the Portal.
//
// Goals:
//   - Catch real bugs (unused vars, hooks deps) without drowning the
//     editor in stylistic noise.
//   - Stay FAST — lint runs locally on demand (`npm run lint`); we do NOT
//     wire it into `next build` so a forgotten unused-var never blocks a
//     deploy. Type errors still block via `npm run typecheck`.
//   - Use plain TypeScript-ESLint + react-hooks instead of the
//     next/core-web-vitals preset, because that preset still ships
//     legacy-eslintrc that crashes on ESLint 9 flat-config.

import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "scripts/**",
      "next-env.d.ts",
      "src/proxy.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    // The codebase has scattered `// eslint-disable-next-line ...` for
    // rules that come from the next/core-web-vitals preset (e.g.
    // `@next/next/no-img-element`, `react/no-danger`). We intentionally
    // don't load that preset (incompatible with ESLint 9 flat-config),
    // so silence "unknown rule in disable directive" rather than chase
    // every disable-comment.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Real-bug rules — keep as errors.
      "react-hooks/rules-of-hooks": "error",

      // Style/quality — start as warn so we can fix incrementally
      // without making `npm run lint` red on day one.
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",

      // We rely on TS for these.
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
);
