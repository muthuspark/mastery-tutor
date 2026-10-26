import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", ".next-e2e*/**", ".ralph/**", "node_modules/**", "coverage/**"],
  },
];

export default eslintConfig;
