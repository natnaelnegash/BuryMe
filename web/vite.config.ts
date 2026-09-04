import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // .env lives at the repo root (alongside docker-compose.yml and the
  // backend's own env loading), not inside web/ — Vite only looks in its
  // own root by default.
  envDir: "../",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
