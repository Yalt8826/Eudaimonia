import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Dev: Vite serves the SPA and proxies /api to uvicorn — in prod there is
// no Node process; FastAPI serves client/dist as static files.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
