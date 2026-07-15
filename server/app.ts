import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { config } from "./env";
import { SYSTEM_PROMPT } from "./system-prompt";

const openrouter = createOpenRouter({ apiKey: config.openrouterApiKey });

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: config.allowedOrigin,
    allowHeaders: ["Content-Type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
  }),
);

app.get("/api/health", (c) =>
  c.json({ ok: true, model: config.openrouterModel }),
);

app.post("/api/chat", async (c) => {
  const { messages } = await c.req.json<{ messages: UIMessage[] }>();

  const result = streamText({
    model: openrouter.chat(config.openrouterModel),
    instructions: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        if (error == null) return "unknown error";
        if (typeof error === "string") return error;
        if (error instanceof Error) return error.message;
        return JSON.stringify(error);
      },
    }),
  });
});
