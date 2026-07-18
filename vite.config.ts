import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    watch: {
      // Packaged Electron + embedded Python trees are huge and exhaust inotify.
      ignored: [
        "**/release/**",
        "**/linux-unpacked/**",
        "**/dist-electron/**",
        "**/build/**",
        "**/server/python/**",
        "**/server/python-*/**",
        "**/.git/**",
      ],
    },
  },
});
