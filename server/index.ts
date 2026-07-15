import { serve } from "@hono/node-server";
import { app } from "./app";
import { assertConfig, config } from "./env";

assertConfig();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  const port = typeof info.port === "number" ? info.port : config.port;
  console.log(`ChatCAD AI backend listening on http://localhost:${port}`);
  console.log(`  model: ${config.openrouterModel}`);
});
