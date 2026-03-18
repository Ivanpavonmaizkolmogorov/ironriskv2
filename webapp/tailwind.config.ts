import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        iron: {
          50: "#f6f7f8",
          100: "#e1e4e8",
          200: "#c3c9d1",
          300: "#9ea6b3",
          400: "#78828f",
          500: "#5d6774",
          600: "#4a5260",
          700: "#3e444f",
          800: "#363b44",
          900: "#30343b",
          950: "#1e2127",
        },
        risk: {
          green: "#00e676",
          yellow: "#ffea00",
          red: "#ff1744",
        },
        surface: {
          primary: "#0d0f12",
          secondary: "#161a1f",
          tertiary: "#1e2228",
          elevated: "#252a31",
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
