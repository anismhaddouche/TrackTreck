import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The admin app is reverse-proxied at http://<host>/admin in production.
// Vite must bake that base into all asset URLs.
export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
});
