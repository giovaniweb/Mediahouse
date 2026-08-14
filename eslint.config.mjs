import coreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/generated/**",
      "worker-transcode/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    // O código já traz comentários eslint-disable de antes desta configuração.
    // Sem isto, `--fix` os apaga como "diretiva não usada" e desfaz supressões
    // que ainda importam para as regras que voltarem a "error".
    linterOptions: { reportUnusedDisableDirectives: "off" },
    // O projeto rodou sem ESLint até agora, então estas regras acusam centenas de
    // ocorrências antigas. Ficam como aviso para o CI poder falhar de verdade no
    // que sobrou como erro; conforme o débito for pago, promova cada uma a "error".
    rules: {
      // Dispara em <a href="/api/..."> — que é uso correto: rota de API não é
      // página do Next e não deve virar <Link>.
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]
