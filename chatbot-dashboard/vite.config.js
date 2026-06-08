import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const flaskTarget = process.env.VITE_FLASK_PROXY_TARGET || "http://127.0.0.1:5001";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("react") || id.includes("react-dom")) {
            return "react-vendor";
          }

          if (id.includes("three") || id.includes("@react-three")) {
            return "three-vendor";
          }

          if (id.includes("firebase")) {
            return "firebase-vendor";
          }

          if (id.includes("framer-motion") || id.includes("motion")) {
            return "motion-vendor";
          }

          return undefined;
        },
      },
    },
  },
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
