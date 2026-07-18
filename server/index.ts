import { serve } from "@hono/node-server";
import { app, configureServer } from "./app";
import {
  pickStandaloneCredentialStore,
  describeProviderStatus,
} from "./credentials";
import { config } from "./env";

const credentialStore = pickStandaloneCredentialStore();
configureServer(credentialStore);

const status = describeProviderStatus(credentialStore);
if (status.activeProvider) {
  console.log(`CADZero AI backend: provider '${status.activeProvider}' configured.`);
} else {
  console.log(
    "CADZero AI backend: no provider API key configured. Set OPENROUTER_API_KEY in server/.env, or run with CADZ_DEV_CREDENTIALS=1 to set keys from the UI.",
  );
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  const port = typeof info.port === "number" ? info.port : config.port;
  console.log(`CADZero AI backend listening on http://localhost:${port}`);
  console.log(`  model: ${config.openrouterModel}`);
});
