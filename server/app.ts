import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { config } from "./env";
import { buildInstructions, type ChatMode } from "./system-prompt";
import type { BackendName } from "./backend-types";
import { renderScad, checkOpenScad } from "./backends/openscad";
import { parseStl } from "./renderer/stl";
import { storeMesh, getMesh } from "./mesh-store";
import { listAvailableModels, resolveModelId } from "./models";

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

app.get("/api/models", async (c) => {
  const models = await listAvailableModels();
  return c.json({ models });
});

app.get("/api/capabilities", async (c) => {
  const openscad = await checkOpenScad();
  return c.json({
    openscad: openscad.ok ? { ok: true, version: openscad.version } : { ok: false, error: openscad.error },
  });
});

app.get("/api/mesh/:id", (c) => {
  const mesh = getMesh(c.req.param("id"));
  if (!mesh) return c.json({ error: "mesh not found" }, 404);
  return c.json(mesh);
});

const updateModelTool = tool({
  description:
    "Update the CAD model. Provide the COMPLETE OpenSCAD script (not a diff); it will be executed and rendered to a mesh. Only call this in BUILD mode.",
  inputSchema: z.object({
    code: z
      .string()
      .describe("The full, self-contained OpenSCAD script for the model."),
    language: z.literal("openscad").describe("The modeling language."),
    message: z
      .string()
      .describe("A short user-facing description of what changed."),
  }),
  execute: async ({ code, message }) => {
    const rendered = await renderScad(code);
    if (!rendered.ok || !rendered.stl) {
      return {
        success: false,
        message: "OpenSCAD failed to render the model.",
        stderr: rendered.stderr || "Unknown render error.",
        durationMs: rendered.durationMs,
      };
    }
    const mesh = parseStl(rendered.stl);
    const meshId = storeMesh(mesh);
    return {
      success: true,
      message,
      stderr: rendered.stderr || "",
      meshId,
      triangleCount: mesh.triangleCount,
      durationMs: rendered.durationMs,
    };
  },
});

interface ChatRequestBody {
  messages: UIMessage[];
  mode?: ChatMode;
  model?: string;
  cadCode?: string | null;
  language?: BackendName;
}

app.post("/api/chat", async (c) => {
  const { messages, mode, model, cadCode, language } =
    await c.req.json<ChatRequestBody>();

  const safeMode: ChatMode =
    mode === "plan" || mode === "build" ? mode : "chat";
  const safeLanguage: BackendName = language ?? "openscad";
  const modelId = await resolveModelId(model);

  const result = streamText({
    model: openrouter.chat(modelId),
    instructions: buildInstructions(safeMode, cadCode ?? null, safeLanguage),
    messages: await convertToModelMessages(messages),
    tools: { update_model: updateModelTool },
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
