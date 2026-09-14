import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Reconhece o prefixo "_" como intencionalmente não usado — convenção
  // já adotada em vários pontos do código (ex: catch (_err: unknown),
  // parâmetros _e) mas que nunca tinha sido de fato configurada aqui.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // patch.js roda via npm lifecycle (postinstall/prepare) como script
    // Node CommonJS puro — não faz parte do bundle TS/ESM da aplicação,
    // então require() ali é legítimo e não deve ser lintado com as
    // regras do app.
    "patch.js",
  ]),
]);

export default eslintConfig;
