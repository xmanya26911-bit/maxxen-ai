import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        maxxen: { 500: "#7c3aed", 600: "#6d28d9" }
      }
    }
  },
  plugins: []
};
export default config;
