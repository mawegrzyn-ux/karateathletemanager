/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        card: "0 1px 2px 0 rgba(28, 25, 23, 0.04), 0 8px 20px -6px rgba(28, 25, 23, 0.10)",
      },
    },
  },
  plugins: [],
};
