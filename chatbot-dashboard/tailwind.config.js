/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#020103",
          900: "#050406",
          850: "#09070d",
          800: "#0d0b12",
          750: "#121018",
        },
        violetx: {
          300: "#d8bcff",
          400: "#b887ff",
          500: "#8d4de8",
          600: "#6f34c5",
          700: "#45206e",
          800: "#28113e",
        },
        mist: {
          100: "#f7f4ff",
          200: "#ded9ea",
          300: "#b8b1c5",
          400: "#837c92",
        },
      },
      boxShadow: {
        glow: "0 0 80px rgba(141, 77, 232, 0.24)",
        card: "0 24px 90px rgba(0, 0, 0, 0.46)",
        purple: "0 24px 80px rgba(111, 52, 197, 0.28)",
        soft: "0 24px 80px rgba(79, 70, 229, 0.14)",
        panel: "0 18px 60px rgba(15, 23, 42, 0.08)",
      },
      backgroundImage: {
        "card-glow":
          "radial-gradient(circle at 55% 105%, rgba(141, 77, 232, 0.22), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015))",
        "purple-field":
          "radial-gradient(circle at 14% -6%, rgba(141, 77, 232, 0.2), transparent 34%), radial-gradient(circle at 86% -4%, rgba(111, 52, 197, 0.16), transparent 36%), linear-gradient(180deg, #050308 0%, #020103 42%, #000000 100%)",
      },
      borderRadius: {
        shell: "18px",
        card: "14px",
      },
    },
  },
  plugins: [],
};
