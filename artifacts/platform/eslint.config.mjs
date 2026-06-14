import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// This config is the lint gate that runs in validation alongside typecheck,
// build, and e2e-signin (see task #159). The intent is to block merge on
// real bugs (rules-of-hooks violations, duplicate JSX props, banned APIs)
// while keeping noisy stylistic rules as warnings so lint stays useful and
// the gate stays green. New offenders of the warning-level rules should
// still be cleaned up over time, but they don't fail the build today.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Stylistic / type-strictness rules: keep visible but non-blocking.
      // The codebase has hundreds of `any` (data-provider envelopes, ad-hoc
      // shapes from third-party APIs) where eliminating `any` is a separate
      // multi-day refactor.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          // Standard underscore-prefix convention for intentionally unused
          // bindings (destructured drops, placeholder fn args, etc.).
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-unused-expressions": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-img-element": "warn",
      // React Compiler / hooks lints below catch real anti-patterns but
      // many existing call sites are intentional (one-shot localStorage
      // hydration, callbacks that look like hooks, etc.). Keep them as
      // warnings so they're surfaced without blocking the gate.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/refs": "warn",
      // Hard errors — these stay blocking:
      //   react-hooks/rules-of-hooks  (genuinely broken hook usage)
      //   react/jsx-no-duplicate-props
      //   @typescript-eslint/no-require-imports
      //   @typescript-eslint/no-var-requires
      //   import/no-anonymous-default-export, etc. (defaults from preset)
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Dev-only `distDir` (see next.config.ts) — same shape as `.next/`.
    ".next-dev/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
