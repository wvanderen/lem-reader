import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Phase 7 spike (07-01 Task 2) — Option A: @cloudflare/vite-plugin.
// The plugin runs /functions code in the real workerd runtime alongside the
// Vite SPA dev server. This is the A3 spike test: does it preserve the v1.0
// SPA dev flow (Playwright webServer on :5173)?
export default defineConfig({
  plugins: [react(), cloudflare()],
});
