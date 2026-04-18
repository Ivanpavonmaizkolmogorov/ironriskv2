import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/utils/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        iron: {
          50: "var(--iron-50)",
          100: "var(--iron-100)",
          200: "var(--iron-200)",
          300: "var(--iron-300)",
          400: "var(--iron-400)",
          500: "var(--iron-500)",
          600: "var(--iron-600)",
          700: "var(--iron-700)",
          800: "var(--iron-800)",
          900: "var(--iron-900)",
          950: "var(--iron-950)",
        },
        risk: {
          green: "var(--risk-green)",
          yellow: "var(--risk-yellow)",
          red: "var(--risk-red)",
        },
        surface: {
          primary: "var(--surface-primary)",
          secondary: "var(--surface-secondary)",
          tertiary: "var(--surface-tertiary)",
          elevated: "var(--surface-elevated)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(0, 230, 118, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(0, 230, 118, 0.4)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
