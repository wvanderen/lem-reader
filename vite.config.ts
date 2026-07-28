import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Phase 1 is a static SPA — no server runtime, no proxy.
});
