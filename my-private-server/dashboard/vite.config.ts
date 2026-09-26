import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The built dashboard is served by the Windows service from its wwwroot folder.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Inline (empty) PostCSS config so a postcss.config.js in a parent folder is never picked up.
  css: { postcss: { plugins: [] } },
  build: { outDir: "../src/MyPrivateServer.Server/wwwroot", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { port: 5173, proxy: { "/api": "http://localhost:8080" } },
});
