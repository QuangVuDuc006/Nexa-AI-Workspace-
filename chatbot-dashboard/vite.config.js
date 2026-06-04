import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const flaskTarget = process.env.VITE_FLASK_PROXY_TARGET || "http://127.0.0.1:5001";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": flaskTarget,
      "/chat": flaskTarget,
      "/static": flaskTarget,
      "/login": flaskTarget,
      "/logout": flaskTarget,
      "/register": flaskTarget,
    },
  },
});
