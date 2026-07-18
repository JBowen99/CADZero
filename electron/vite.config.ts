import { defineConfig } from "vite";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const serverRuntimeExternals = [
  "hono",
  "hono/cors",
  "@hono/node-server",
  "@openrouter/ai-sdk-provider",
  "ai",
  "zod",
  "better-sqlite3",
];

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    target: "node22",
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        main: fileURLToPath(new URL("main.ts", import.meta.url)),
        preload: fileURLToPath(new URL("preload.ts", import.meta.url)),
      },
      formats: ["cjs"],
      fileName: (_format, entryName) => `${entryName}.cjs`,
    },
    rollupOptions: {
      external: [
        "electron",
        ...builtinModules.flatMap((m) => [m, `node:${m}`]),
        ...serverRuntimeExternals,
      ],
    },
  },
});
