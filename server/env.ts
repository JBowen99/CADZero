export const config = {
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openrouterModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
  port: Number(process.env.PORT ?? "8787"),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
};

export function assertConfig(): void {
  if (!config.openrouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Copy server/.env.example to server/.env and add your OpenRouter API key.",
    );
  }
}
