import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode: the CAD viewport uses WebGL (browser-only), so we disable SSR.
  ssr: false,
} satisfies Config;
