import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Dev: Vite serves the SPA and proxies /api to uvicorn — in prod there is
// no Node process; FastAPI serves client/dist as static files.
// The service worker is a SECOND build entry, emitted under the fixed name
// sw.js so the registration URL and update checks stay stable.
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
  build: {
    rollupOptions: {
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        sw: new URL("./src/sw/sw.ts", import.meta.url).pathname,
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
