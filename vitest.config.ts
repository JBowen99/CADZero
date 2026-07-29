import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone config: intentionally does NOT load the react-router/tailwind
// vite plugins so the test runner stays isolated and fast. The `~` alias
// matches tsconfig.json's path mapping for `./app/*`.
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
