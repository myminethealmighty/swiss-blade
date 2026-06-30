import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  ...nextVitals,
  {
    ignores: ["out/**", ".next/**", "public/background.js", "public/content.js", "public/popup.js"]
  }
];
