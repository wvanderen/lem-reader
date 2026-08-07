import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/component/**/*.test.tsx"],
    exclude: ["tests/e2e", "node_modules"],
    // jsdom is NOT authoritative for layout (STACK.md "What NOT to Use").
    // Layout/reading-order/focus assertions run in Playwright, not here.
  },
});
